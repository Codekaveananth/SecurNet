package com.securenet.gateway.service;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import com.securenet.gateway.exception.MlServiceException;

/** Thin typed client over the Python ML microservice. */
@Service
public class MlClient {

    private static final Logger log = LoggerFactory.getLogger(MlClient.class);
    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
            new ParameterizedTypeReference<>() {
            };

    private final WebClient client;

    public MlClient(WebClient mlWebClient) {
        this.client = mlWebClient;
    }

    private Map<String, Object> post(String path, Map<String, Object> body) {
        try {
            Map<String, Object> response = client.post()
                    .uri(path)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(MAP_TYPE)
                    .block();
            if (response == null) {
                throw new MlServiceException("Empty response from " + path);
            }
            return response;
        } catch (MlServiceException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Call to {} failed: {}", path, ex.getMessage());
            throw new MlServiceException("ML service call to " + path + " failed", ex);
        }
    }

    public Map<String, Object> scanUrl(String url) {
        return post("/api/v1/scan/url", Map.of("url", url));
    }

    public Map<String, Object> scanSms(String message) {
        return post("/api/v1/scan/sms", Map.of("message", message));
    }

    public Map<String, Object> health() {
        try {
            Map<String, Object> r = client.get().uri("/health")
                    .retrieve().bodyToMono(MAP_TYPE).block();
            return r == null ? Map.of("status", "unreachable") : r;
        } catch (Exception ex) {
            return Map.of("status", "unreachable", "detail", String.valueOf(ex.getMessage()));
        }
    }

    public Map<String, Object> metrics() {
        return client.get().uri("/metrics").retrieve().bodyToMono(MAP_TYPE).block();
    }
}
