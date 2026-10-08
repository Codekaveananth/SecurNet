package com.securenet.gateway.config;

import com.securenet.gateway.repository.UserRepository;
import com.securenet.gateway.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.beans.factory.annotation.Value;

import java.util.Arrays;
import java.util.List;

/**
 * Spring Security configuration.
 *
 * Stateless JWT authentication. Written with the lambda DSL because the older
 * .csrf().and() chaining style is removed in Spring Security 6.
 *
 * Note on the scan endpoints: they are left open rather than requiring
 * authentication. The browser extension has no way to log in, and rejecting it
 * would break real-time alerts. Scans made with a valid token are attributed
 * to that user; anonymous scans are stored without an owner. History and
 * statistics DO require authentication, since those are per-user views.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final UserRepository userRepository;
    private final String allowedOrigins;

    public SecurityConfig(
            @Lazy JwtAuthenticationFilter jwtAuthenticationFilter,
            UserRepository userRepository,
            @Value("${securenet.cors.allowed-origins:http://localhost:5173}") String allowedOrigins) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.userRepository = userRepository;
        this.allowedOrigins = allowedOrigins;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** Loads users from the database for authentication. */
    @Bean
    public UserDetailsService userDetailsService() {
        return username -> userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService());
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config)
            throws Exception {
        return config.getAuthenticationManager();
    }

    /**
     * CORS for the React dev server and the browser extension.
     *
     * The extension's origin is chrome-extension://<id>, where the id is
     * generated when the unpacked extension is loaded, so it cannot be listed
     * ahead of time and is matched by pattern instead.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOriginPatterns(Arrays.asList(
                (allowedOrigins + ",chrome-extension://*,moz-extension://*").split(",")));
        cors.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "Authorization"));
        cors.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // Return 401 rather than redirecting to a login page, which is what
            // a JSON client expects.
            .exceptionHandling(eh -> eh.authenticationEntryPoint(
                    new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .authorizeHttpRequests(authz -> authz
                .requestMatchers(
                        "/api/v1/auth/**",
                        "/api/v1/health",
                        "/api/v1/model/metrics",
                        "/health",
                        "/actuator/health",
                        "/error"
                ).permitAll()
                // Single-scan lookup is owner-only (see ScanService.findById).
                .requestMatchers(HttpMethod.GET, "/api/v1/scan/*").authenticated()
                // Open so the browser extension can scan without an account.
                .requestMatchers(HttpMethod.POST, "/api/v1/scan", "/api/v1/scan/**").permitAll()
                // Anyone may report a wrong verdict; reading the reports is not public.
                .requestMatchers(HttpMethod.POST, "/api/v1/feedback").permitAll()
                .requestMatchers("/api/v1/feedback/**").authenticated()
                // Per-user views require a token.
                .requestMatchers("/api/v1/history", "/api/v1/statistics").authenticated()
                .requestMatchers("/h2-console/**").permitAll()
                .anyRequest().denyAll()
            )
            .authenticationProvider(authenticationProvider())
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        // The H2 console renders in a frame; the default DENY would blank it.
        http.headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()));

        return http.build();
    }
}
