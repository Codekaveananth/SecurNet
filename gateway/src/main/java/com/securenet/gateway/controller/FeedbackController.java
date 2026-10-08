package com.securenet.gateway.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.securenet.gateway.dto.FeedbackRequest;
import com.securenet.gateway.model.FeedbackRecord;
import com.securenet.gateway.service.FeedbackService;

import jakarta.validation.Valid;

/** Analyst feedback loop endpoints. */
@RestController
@RequestMapping("/api/v1/feedback")
public class FeedbackController {

    private final FeedbackService feedbackService;

    public FeedbackController(FeedbackService feedbackService) {
        this.feedbackService = feedbackService;
    }

    @PostMapping
    public ResponseEntity<FeedbackRecord> submit(@Valid @RequestBody FeedbackRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(feedbackService.submit(request));
    }

    @GetMapping("/disagreements")
    public ResponseEntity<List<FeedbackRecord>> disagreements() {
        return ResponseEntity.ok(feedbackService.disagreements());
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> summary() {
        return ResponseEntity.ok(feedbackService.summary());
    }

    /** Export corrected rows for appending to the training corpus. */
    @GetMapping("/export")
    public ResponseEntity<List<Map<String, Object>>> export(
            @RequestParam(defaultValue = "url") String type) {
        return ResponseEntity.ok(feedbackService.exportForRetraining(type));
    }
}
