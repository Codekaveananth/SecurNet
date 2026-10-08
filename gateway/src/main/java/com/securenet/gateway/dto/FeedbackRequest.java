package com.securenet.gateway.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Analyst correction submitted from the UI.
 *
 * Corrections accumulate in the feedback table and are exported by
 * FeedbackService.exportForRetraining() as additional labelled rows. This is
 * the mechanism by which India-specific scam variants that the public corpora
 * do not contain enter the training set.
 */
public class FeedbackRequest {

    @NotNull(message = "scanId is required")
    private Long scanId;

    @NotNull(message = "correctLabel is required")
    @Min(value = 0, message = "correctLabel must be 0 (safe) or 1 (malicious)")
    @Max(value = 1, message = "correctLabel must be 0 (safe) or 1 (malicious)")
    private Integer correctLabel;

    private String note;
    private String submittedBy;

    public Long getScanId() { return scanId; }
    public void setScanId(Long scanId) { this.scanId = scanId; }

    public Integer getCorrectLabel() { return correctLabel; }
    public void setCorrectLabel(Integer correctLabel) { this.correctLabel = correctLabel; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getSubmittedBy() { return submittedBy; }
    public void setSubmittedBy(String submittedBy) { this.submittedBy = submittedBy; }
}
