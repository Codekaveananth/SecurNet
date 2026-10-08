package com.securenet.gateway.model;

import java.time.Instant;

import jakarta.persistence.*;

/** Persisted record of a single scan. */
@Entity
@Table(name = "scan_record", indexes = {
        @Index(name = "idx_scan_hash", columnList = "artefactHash"),
        @Index(name = "idx_scan_time", columnList = "scannedAt"),
        @Index(name = "idx_scan_user", columnList = "userId")
})
public class ScanRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 4000, nullable = false)
    private String artefact;

    /** SHA-256 of the canonical artefact; used for the cache lookup. */
    @Column(nullable = false, length = 64)
    private String artefactHash;

    @Column(nullable = false, length = 8)
    private String artefactType;

    @Column(length = 2048)
    private String canonicalForm;

    @Column(nullable = false, length = 16)
    private String verdict;

    @Column(nullable = false, length = 8)
    private String riskBand;

    @Column(nullable = false)
    private Double score;

    private Double threshold;
    private Double baseValue;
    private Double latencyMs;

    @Column(length = 64)
    private String modelVersion;

    /** Raw evidence array as returned by the ML service, stored verbatim. */
    @Lob
    @Column(columnDefinition = "CLOB")
    private String evidenceJson;

    @Column(length = 512)
    private String indiaSignals;

    @Column(nullable = true)
    private Long userId;

    @Column(nullable = false)
    private Instant scannedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getArtefact() { return artefact; }
    public void setArtefact(String artefact) { this.artefact = artefact; }

    public String getArtefactHash() { return artefactHash; }
    public void setArtefactHash(String artefactHash) { this.artefactHash = artefactHash; }

    public String getArtefactType() { return artefactType; }
    public void setArtefactType(String artefactType) { this.artefactType = artefactType; }

    public String getCanonicalForm() { return canonicalForm; }
    public void setCanonicalForm(String canonicalForm) { this.canonicalForm = canonicalForm; }

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

    public Double getLatencyMs() { return latencyMs; }
    public void setLatencyMs(Double latencyMs) { this.latencyMs = latencyMs; }

    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String modelVersion) { this.modelVersion = modelVersion; }

    public String getEvidenceJson() { return evidenceJson; }
    public void setEvidenceJson(String evidenceJson) { this.evidenceJson = evidenceJson; }

    public String getIndiaSignals() { return indiaSignals; }
    public void setIndiaSignals(String indiaSignals) { this.indiaSignals = indiaSignals; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Instant getScannedAt() { return scannedAt; }
    public void setScannedAt(Instant scannedAt) { this.scannedAt = scannedAt; }
}
