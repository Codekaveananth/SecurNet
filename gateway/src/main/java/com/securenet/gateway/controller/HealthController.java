package com.securenet.gateway.controller;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.securenet.gateway.service.MlClient;

/** Aggregated health and model metrics across both tiers. */
@RestController
@RequestMapping("/api/v1")
public class HealthController {

    private final MlClient mlClient;

    public HealthController(MlClient mlClient) {
        this.mlClient = mlClient;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("gateway", "ok");
        body.put("mlService", mlClient.health());
        return ResponseEntity.ok(body);
    }

    /** Proxies the evaluation metrics written by the training scripts. */
    @GetMapping("/model/metrics")
    public ResponseEntity<Map<String, Object>> metrics() {
        return ResponseEntity.ok(mlClient.metrics());
    }
}
