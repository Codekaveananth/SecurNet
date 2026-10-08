package com.securenet.gateway.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.securenet.gateway.dto.FeedbackRequest;
import com.securenet.gateway.exception.ResourceNotFoundException;
import com.securenet.gateway.model.FeedbackRecord;
import com.securenet.gateway.model.ScanRecord;
import com.securenet.gateway.repository.FeedbackRecordRepository;
import com.securenet.gateway.repository.ScanRecordRepository;

/**
 * Analyst feedback loop.
 *
 * Corrections where the analyst disagrees with the model are the valuable
 * rows: they are the India-specific variants the public corpora do not cover.
 * exportForRetraining() emits them in the same (artefact, label) shape the
 * training scripts consume, so they can be appended to data/urls.csv or
 * data/sms.csv and the model retrained.
 */
@Service
public class FeedbackService {

    private final FeedbackRecordRepository feedbackRepository;
    private final ScanRecordRepository scanRepository;

    public FeedbackService(FeedbackRecordRepository feedbackRepository,
                           ScanRecordRepository scanRepository) {
        this.feedbackRepository = feedbackRepository;
        this.scanRepository = scanRepository;
    }

    @Transactional
    public FeedbackRecord submit(FeedbackRequest request) {
        ScanRecord scan = scanRepository.findById(request.getScanId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No scan with id " + request.getScanId()));

        Integer predicted = isMalicious(scan.getVerdict()) ? 1 : 0;

        FeedbackRecord entity = new FeedbackRecord();
        entity.setScanId(scan.getId());
        entity.setArtefact(scan.getArtefact());
        entity.setArtefactType(scan.getArtefactType());
        entity.setPredictedLabel(predicted);
        entity.setCorrectLabel(request.getCorrectLabel());
        entity.setDisagreement(!predicted.equals(request.getCorrectLabel()));
        entity.setScore(scan.getScore());
        entity.setNote(request.getNote());
        entity.setSubmittedBy(request.getSubmittedBy());
        return feedbackRepository.save(entity);
    }

    private static boolean isMalicious(String verdict) {
        return "PHISHING".equals(verdict) || "SCAM".equals(verdict);
    }

    public List<FeedbackRecord> disagreements() {
        return feedbackRepository.findByDisagreementTrueOrderBySubmittedAtDesc();
    }

    public Map<String, Object> summary() {
        long total = feedbackRepository.count();
        long wrong = feedbackRepository.countByDisagreementTrue();
        return Map.of(
                "totalFeedback", total,
                "disagreements", wrong,
                "agreementRate", total == 0 ? 1.0 : (double) (total - wrong) / total
        );
    }

    /** Rows ready to be appended to the training corpus. */
    public List<Map<String, Object>> exportForRetraining(String artefactType) {
        return feedbackRepository.findByArtefactType(artefactType).stream()
                .filter(FeedbackRecord::getDisagreement)
                .map(f -> Map.<String, Object>of(
                        "artefact", f.getArtefact(),
                        "label", f.getCorrectLabel()))
                .toList();
    }
}
