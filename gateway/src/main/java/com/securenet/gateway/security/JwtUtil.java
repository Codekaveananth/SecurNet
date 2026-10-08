package com.securenet.gateway.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * JWT generation and validation.
 *
 * Written against the JJWT 0.12.x API (Jwts.parser()/verifyWith and the
 * builder's claims()/subject()/expiration() methods). The 0.11-era
 * parserBuilder() and setX() calls do not exist in this version, so mixing
 * them would not compile.
 *
 * HS256 requires a key of at least 256 bits, so the configured secret must be
 * at least 32 bytes of UTF-8. Checking it here fails fast at startup instead
 * of throwing on the first login attempt.
 */
@Component
public class JwtUtil {

    private final SecretKey key;
    private final long expirationMs;

    public JwtUtil(
            @Value("${securenet.jwt.secret}") String secret,
            @Value("${securenet.jwt.expiration:86400000}") long expirationMs) {

        byte[] keyBytes;
        if (secret == null || secret.isBlank()) {
            keyBytes = new byte[32];
            new SecureRandom().nextBytes(keyBytes);
            org.slf4j.LoggerFactory.getLogger(JwtUtil.class).warn(
                    "SECURENET_JWT_SECRET is not set; using a random per-process key. "
                            + "Issued tokens will be invalid after a restart.");
        } else {
            keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        }
        if (keyBytes.length < 32) {
            throw new IllegalStateException(
                    "securenet.jwt.secret must be at least 32 bytes for HS256; got "
                            + keyBytes.length);
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.expirationMs = expirationMs;
    }

    /** Generate a token for the given user. */
    public String generateToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();
        userDetails.getAuthorities().stream().findFirst()
                .ifPresent(a -> claims.put("role", a.getAuthority()));

        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .claims(claims)
                .subject(userDetails.getUsername())
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /** Username carried by the token. Throws if the token is not valid. */
    public String getUsernameFromToken(String token) {
        return parseClaims(token).getSubject();
    }

    public Date getExpirationDateFromToken(String token) {
        return parseClaims(token).getExpiration();
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * Validate signature and expiry.
     *
     * An expired or tampered token makes parseClaims throw, so the catch is
     * what turns that into false rather than a propagating exception.
     */
    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }

    /** Validate the token and confirm it belongs to the given user. */
    public boolean validateToken(String token, UserDetails userDetails) {
        try {
            return parseClaims(token).getSubject().equals(userDetails.getUsername());
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }

    public long getExpirationMs() {
        return expirationMs;
    }
}
