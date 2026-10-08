package com.securenet.gateway.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** An analyst correction of a prediction. */
@Entity
@Table(name = "feedback_record")
public class FeedbackRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long scanId;

    @Column(length = 4000, nullable = false)
    private String artefact;

    @Column(nullable = false, length = 8)
    private String artefactType;

    @Column(nullable = false)
    private Integer predictedLabel;

    @Column(nullable = false)
    private Integer correctLabel;

    /** True when the model got it wrong; the rows worth retraining on. */
    @Column(nullable = false)
    private Boolean disagreement;

    private Double score;

    @Column(length = 1000)
    private String note;

    @Column(length = 120)
    private String submittedBy;

    @Column(nullable = false)
    private Instant submittedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getScanId() { return scanId; }
    public void setScanId(Long scanId) { this.scanId = scanId; }

    public String getArtefact() { return artefact; }
    public void setArtefact(String artefact) { this.artefact = artefact; }

    public String getArtefactType() { return artefactType; }
    public void setArtefactType(String artefactType) { this.artefactType = artefactType; }

    public Integer getPredictedLabel() { return predictedLabel; }
    public void setPredictedLabel(Integer predictedLabel) { this.predictedLabel = predictedLabel; }

    public Integer getCorrectLabel() { return correctLabel; }
    public void setCorrectLabel(Integer correctLabel) { this.correctLabel = correctLabel; }

    public Boolean getDisagreement() { return disagreement; }
    public void setDisagreement(Boolean disagreement) { this.disagreement = disagreement; }

    public Double getScore() { return score; }
    public void setScore(Double score) { this.score = score; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getSubmittedBy() { return submittedBy; }
    public void setSubmittedBy(String submittedBy) { this.submittedBy = submittedBy; }

    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }
}
