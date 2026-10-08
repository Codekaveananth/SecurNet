package com.securenet.gateway.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.securenet.gateway.dto.EvidenceDto;
import com.securenet.gateway.dto.ScanResponse;
import com.securenet.gateway.exception.ResourceNotFoundException;
import com.securenet.gateway.model.ScanRecord;
import com.securenet.gateway.repository.ScanRecordRepository;

/**
 * Orchestrates a scan: route to the right model, persist the result, and
 * serve repeat requests from the scan history instead of re-invoking the
 * model. The cache key is a hash of the artefact, so the same phishing URL
 * submitted twice costs one inference.
 */
@Service
public class ScanService {

    private static final Logger log = LoggerFactory.getLogger(ScanService.class);

    private final MlClient mlClient;
    private final ScanRecordRepository repository;
    private final ObjectMapper mapper = new ObjectMapper();

    public ScanService(MlClient mlClient, ScanRecordRepository repository) {
        this.mlClient = mlClient;
        this.repository = repository;
    }

    /** Heuristic: a single token with no spaces and a dot is treated as a URL. */
    public static boolean looksLikeUrl(String artefact) {
        String t = artefact.trim();
        if (t.contains(" ")) {
            return false;
        }
        return t.contains(".") || t.startsWith("http://") || t.startsWith("https://");
    }

    static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    @Transactional
    public ScanResponse scanUrl(String url) {
        return scan(url, "url", null);
    }

    @Transactional
    public ScanResponse scanUrl(String url, Long userId) {
        return scan(url, "url", userId);
    }

    @Transactional
    public ScanResponse scanSms(String message) {
        return scan(message, "sms", null);
    }

    @Transactional
    public ScanResponse scanSms(String message, Long userId) {
        return scan(message, "sms", userId);
    }

    @Transactional
    public ScanResponse scanAuto(String artefact) {
        return scan(artefact, looksLikeUrl(artefact) ? "url" : "sms", null);
    }

    @Transactional
    public ScanResponse scanAuto(String artefact, Long userId) {
        return scan(artefact, looksLikeUrl(artefact) ? "url" : "sms", userId);
    }

    private ScanResponse scan(String artefact, String type, Long userId) {
        long t0 = System.nanoTime();
        String hash = sha256(type + "|" + artefact.trim().toLowerCase());

        // The cache must be scoped to the requesting user. A global lookup by
        // hash would hand one user's stored record -- and its id -- to another,
        // and the row would then appear in the wrong person's history.
        Optional<ScanRecord> cached = userId == null
                ? repository.findFirstByArtefactHashAndUserIdIsNullOrderByScannedAtDesc(hash)
                : repository.findFirstByArtefactHashAndUserIdOrderByScannedAtDesc(hash, userId);
        if (cached.isPresent()) {
            ScanResponse response = toResponse(cached.get());
            response.setCached(true);
            response.setGatewayLatencyMs((System.nanoTime() - t0) / 1_000_000.0);
            return response;
        }

        Map<String, Object> ml = "url".equals(type)
                ? mlClient.scanUrl(artefact)
                : mlClient.scanSms(artefact);

        ScanRecord entity = persist(artefact, type, hash, ml, userId);
        ScanResponse response = toResponse(entity);
        response.setContainsUrl(asBoolean(ml.get("contains_url")));
        response.setEmbeddedUrlVerdict((String) ml.get("embedded_url_verdict"));
        response.setAnalysis(extractAnalysis(ml));
        response.setCached(false);
        response.setGatewayLatencyMs((System.nanoTime() - t0) / 1_000_000.0);
        return response;
    }

    private ScanRecord persist(String artefact, String type, String hash,
            Map<String, Object> ml, Long userId) {
        ScanRecord entity = new ScanRecord();
        entity.setArtefact(artefact);
        entity.setArtefactHash(hash);
        entity.setArtefactType(type);
        entity.setCanonicalForm((String) ml.getOrDefault("canonical_url", artefact));
        entity.setVerdict((String) ml.get("verdict"));
        entity.setRiskBand((String) ml.get("risk_band"));
        entity.setScore(asDouble(ml.get("score")));
        entity.setThreshold(asDouble(ml.get("threshold")));
        entity.setBaseValue(asDouble(ml.get("base_value")));
        entity.setLatencyMs(asDouble(ml.get("latency_ms")));
        entity.setModelVersion((String) ml.get("model_version"));
        entity.setUserId(userId);
        entity.setScannedAt(Instant.now());
        try {
            entity.setEvidenceJson(mapper.writeValueAsString(ml.get("evidence")));
            Object signals = ml.get("india_signals");
            entity.setIndiaSignals(signals == null ? "[]" : mapper.writeValueAsString(signals));
        } catch (Exception ex) {
            log.warn("Could not serialise evidence: {}", ex.getMessage());
            entity.setEvidenceJson("[]");
            entity.setIndiaSignals("[]");
        }
        return repository.save(entity);
    }

    @SuppressWarnings("unchecked")
    private ScanResponse toResponse(ScanRecord entity) {
        ScanResponse r = new ScanResponse();
        r.setScanId(entity.getId());
        r.setArtefact(entity.getArtefact());
        r.setArtefactType(entity.getArtefactType());
        r.setCanonicalUrl(entity.getCanonicalForm());
        r.setVerdict(entity.getVerdict());
        r.setRiskBand(entity.getRiskBand());
        r.setScore(entity.getScore());
        r.setThreshold(entity.getThreshold());
        r.setBaseValue(entity.getBaseValue());
        r.setLatencyMs(entity.getLatencyMs());
        r.setModelVersion(entity.getModelVersion());
        r.setScannedAt(entity.getScannedAt());
        try {
            List<Map<String, Object>> raw = mapper.readValue(
                    entity.getEvidenceJson() == null ? "[]" : entity.getEvidenceJson(), List.class);
            List<EvidenceDto> evidence = new ArrayList<>();
            for (Map<String, Object> e : raw) {
                EvidenceDto dto = new EvidenceDto();
                dto.setFeature((String) e.get("feature"));
                dto.setValue(asDouble(e.get("value")));
                dto.setContribution(asDouble(e.get("contribution")));
                dto.setDirection((String) e.get("direction"));
                dto.setDescription((String) e.get("description"));
                evidence.add(dto);
            }
            r.setEvidence(evidence);
            r.setIndiaSignals(mapper.readValue(
                    entity.getIndiaSignals() == null ? "[]" : entity.getIndiaSignals(), List.class));
        } catch (Exception ex) {
            r.setEvidence(List.of());
            r.setIndiaSignals(List.of());
        }
        return r;
    }

    /**
     * Returns a scan only to the user who owns it. Ids are sequential, so an
     * unscoped lookup would let anyone enumerate every URL other people have
     * checked. Not-found and not-yours deliberately look identical.
     */
    public ScanResponse findById(Long id, Long userId) {
        return repository.findById(id)
                .filter(r -> userId != null && userId.equals(r.getUserId()))
                .map(this::toResponse)
                .orElseThrow(() -> new ResourceNotFoundException("No scan with id " + id));
    }

    public List<ScanResponse> history(int limit) {
        return history(limit, null);
    }

    /**
     * Scan history. When userId is given only that user's scans are returned,
     * so one account can never see another's.
     */
    public List<ScanResponse> history(int limit, Long userId) {
        PageRequest page = PageRequest.of(0, Math.min(limit, 200));
        List<ScanRecord> rows = userId == null
                ? repository.findAllByOrderByScannedAtDesc(page)
                : repository.findByUserIdOrderByScannedAtDesc(userId, page);
        return rows.stream().map(this::toResponse).toList();
    }

    public Map<String, Object> statistics() {
        return statistics(null);
    }

    /** Statistics, scoped to one user when userId is given. */
    public Map<String, Object> statistics(Long userId) {
        if (userId == null) {
            return Map.of(
                    "totalScans", repository.count(),
                    "urlScans", repository.countByArtefactType("url"),
                    "smsScans", repository.countByArtefactType("sms"),
                    "phishingDetected", repository.countByVerdict("PHISHING"),
                    "scamDetected", repository.countByVerdict("SCAM"),
                    "suspicious", repository.countByVerdict("SUSPICIOUS"),
                    "legitimate", repository.countByVerdict("LEGITIMATE"),
                    "avgUrlLatencyMs",
                            Optional.ofNullable(repository.averageLatency("url")).orElse(0.0),
                    "avgSmsLatencyMs",
                            Optional.ofNullable(repository.averageLatency("sms")).orElse(0.0)
            );
        }
        return Map.of(
                "totalScans", repository.countByUserId(userId),
                "urlScans", repository.countByUserIdAndArtefactType(userId, "url"),
                "smsScans", repository.countByUserIdAndArtefactType(userId, "sms"),
                "phishingDetected", repository.countByUserIdAndVerdict(userId, "PHISHING"),
                "scamDetected", repository.countByUserIdAndVerdict(userId, "SCAM"),
                "suspicious", repository.countByUserIdAndVerdict(userId, "SUSPICIOUS"),
                "legitimate", repository.countByUserIdAndVerdict(userId, "LEGITIMATE"),
                "avgUrlLatencyMs", Optional.ofNullable(
                        repository.averageLatencyForUser("url", userId)).orElse(0.0),
                "avgSmsLatencyMs", Optional.ofNullable(
                        repository.averageLatencyForUser("sms", userId)).orElse(0.0)
        );
    }

    /** v1.1 ML fields that the gateway does not persist but passes through. */
    private static final List<String> ANALYSIS_KEYS = List.of(
            "logit", "other_contribution", "confidence", "suspicious_band", "features",
            "contributions", "anatomy", "indicators", "text_verdict", "text_score",
            "escalated_by_url", "embedded_urls", "scam_patterns");

    private static Map<String, Object> extractAnalysis(Map<String, Object> ml) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        for (String k : ANALYSIS_KEYS) {
            if (ml.containsKey(k)) {
                out.put(k, ml.get(k));
            }
        }
        return out;
    }

    private static Double asDouble(Object o) {
        return o instanceof Number n ? n.doubleValue() : null;
    }

    private static Boolean asBoolean(Object o) {
        return o instanceof Boolean b ? b : null;
    }
}
