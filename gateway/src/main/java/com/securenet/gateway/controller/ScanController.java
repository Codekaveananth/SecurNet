package com.securenet.gateway.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.securenet.gateway.model.User;
import com.securenet.gateway.dto.ScanRequest;
import com.securenet.gateway.dto.ScanResponse;
import com.securenet.gateway.repository.UserRepository;
import com.securenet.gateway.service.ScanService;

import jakarta.validation.Valid;

/**
 * Scanning API endpoint.
 * 
 * The /scan endpoints now require authentication. Authentication is optional
 * for backwards compatibility (e.g., if the gateway is called directly from
 * the ML service or via browser extension), but when provided, scans are
 * associated with the authenticated user.
 */
@RestController
@RequestMapping("/api/v1")
public class ScanController {

    private final ScanService scanService;
    private final UserRepository userRepository;

    public ScanController(ScanService scanService, UserRepository userRepository) {
        this.scanService = scanService;
        this.userRepository = userRepository;
    }

    @PostMapping("/scan/url")
    public ResponseEntity<ScanResponse> scanUrl(@Valid @RequestBody ScanRequest request,
                                                 Authentication authentication) {
        Long userId = authentication != null ? extractUserId(authentication) : null;
        return ResponseEntity.ok(scanService.scanUrl(request.getArtefact(), userId));
    }

    @PostMapping("/scan/sms")
    public ResponseEntity<ScanResponse> scanSms(@Valid @RequestBody ScanRequest request,
                                                 Authentication authentication) {
        Long userId = authentication != null ? extractUserId(authentication) : null;
        return ResponseEntity.ok(scanService.scanSms(request.getArtefact(), userId));
    }

    /** Routes to the URL or SMS model based on the shape of the input. */
    @PostMapping("/scan")
    public ResponseEntity<ScanResponse> scanAuto(@Valid @RequestBody ScanRequest request,
                                                  Authentication authentication) {
        Long userId = authentication != null ? extractUserId(authentication) : null;
        return ResponseEntity.ok(scanService.scanAuto(request.getArtefact(), userId));
    }

    /** Owner-only: anonymous scans and other users' scans return 404. */
    @GetMapping("/scan/{id}")
    public ResponseEntity<ScanResponse> byId(@PathVariable Long id, Authentication authentication) {
        Long userId = authentication != null ? extractUserId(authentication) : null;
        return ResponseEntity.ok(scanService.findById(id, userId));
    }

    @GetMapping("/history")
    public ResponseEntity<List<ScanResponse>> history(
            @RequestParam(defaultValue = "25") int limit,
            Authentication authentication) {
        Long userId = authentication != null ? extractUserId(authentication) : null;
        return ResponseEntity.ok(scanService.history(limit, userId));
    }

    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> statistics(Authentication authentication) {
        Long userId = authentication != null ? extractUserId(authentication) : null;
        return ResponseEntity.ok(scanService.statistics(userId));
    }

    /**
     * Resolve the database id of the signed-in user.
     *
     * Returns null for anonymous requests, which keeps the browser extension
     * and any unauthenticated caller working: their scans are simply stored
     * without an owner rather than being rejected.
     */
    private Long extractUserId(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        String username;
        if (principal instanceof UserDetails details) {
            username = details.getUsername();
        } else if (principal instanceof String s && !"anonymousUser".equals(s)) {
            username = s;
        } else {
            return null;
        }
        return userRepository.findByUsername(username).map(User::getId).orElse(null);
    }
}
