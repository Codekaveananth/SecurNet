package com.securenet.gateway.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Unified scan response.
 *
 * The URL and SMS scanners return the same envelope so the frontend can render
 * a single evidence-ledger component for either artefact type.
 */
public class ScanResponse {

    private Long scanId;
    private String artefact;
    private String artefactType;

    @JsonProperty("canonical_url")
    private String canonicalUrl;

    private String verdict;

    @JsonProperty("risk_band")
    private String riskBand;

    private Double score;
    private Double threshold;

    @JsonProperty("base_value")
    private Double baseValue;

    private List<EvidenceDto> evidence;

    @JsonProperty("india_signals")
    private List<String> indiaSignals;

    @JsonProperty("contains_url")
    private Boolean containsUrl;

    @JsonProperty("embedded_url_verdict")
    private String embeddedUrlVerdict;

    @JsonProperty("latency_ms")
    private Double latencyMs;

    @JsonProperty("gateway_latency_ms")
    private Double gatewayLatencyMs;

    @JsonProperty("model_version")
    private String modelVersion;

    private Boolean cached;
    private Instant scannedAt;

    public Long getScanId() { return scanId; }
    public void setScanId(Long scanId) { this.scanId = scanId; }

    public String getArtefact() { return artefact; }
    public void setArtefact(String artefact) { this.artefact = artefact; }

    public String getArtefactType() { return artefactType; }
    public void setArtefactType(String artefactType) { this.artefactType = artefactType; }

    public String getCanonicalUrl() { return canonicalUrl; }
    public void setCanonicalUrl(String canonicalUrl) { this.canonicalUrl = canonicalUrl; }

    public String getVerdict() { return verdict; }
    public void setVerdict(String verdict) { this.verdict = verdict; }

    public String getRiskBand() { return riskBand; }
    public void setRiskBand(String riskBand) { this.riskBand = riskBand; }

    public Double getScore() { return score; }
    public void setScore(Double score) { this.score = score; }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }

    public Double getBaseValue() { return baseValue; }
    public void setBaseValue(Double baseValue) { this.baseValue = baseValue; }

    public List<EvidenceDto> getEvidence() { return evidence; }
    public void setEvidence(List<EvidenceDto> evidence) { this.evidence = evidence; }

    public List<String> getIndiaSignals() { return indiaSignals; }
    public void setIndiaSignals(List<String> indiaSignals) { this.indiaSignals = indiaSignals; }

    public Boolean getContainsUrl() { return containsUrl; }
    public void setContainsUrl(Boolean containsUrl) { this.containsUrl = containsUrl; }

    public String getEmbeddedUrlVerdict() { return embeddedUrlVerdict; }
    public void setEmbeddedUrlVerdict(String embeddedUrlVerdict) { this.embeddedUrlVerdict = embeddedUrlVerdict; }

    public Double getLatencyMs() { return latencyMs; }
    public void setLatencyMs(Double latencyMs) { this.latencyMs = latencyMs; }

    public Double getGatewayLatencyMs() { return gatewayLatencyMs; }
    public void setGatewayLatencyMs(Double gatewayLatencyMs) { this.gatewayLatencyMs = gatewayLatencyMs; }

    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String modelVersion) { this.modelVersion = modelVersion; }

    public Boolean getCached() { return cached; }
    public void setCached(Boolean cached) { this.cached = cached; }

    /** Additional ML analysis (v1.1) passed through on fresh scans only. */
    private Map<String, Object> analysis;

    public Map<String, Object> getAnalysis() { return analysis; }
    public void setAnalysis(Map<String, Object> analysis) { this.analysis = analysis; }

    public Instant getScannedAt() { return scannedAt; }
    public void setScannedAt(Instant scannedAt) { this.scannedAt = scannedAt; }
}
