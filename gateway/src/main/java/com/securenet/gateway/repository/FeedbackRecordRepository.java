package com.securenet.gateway.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.securenet.gateway.model.FeedbackRecord;

@Repository
public interface FeedbackRecordRepository extends JpaRepository<FeedbackRecord, Long> {

    List<FeedbackRecord> findByDisagreementTrueOrderBySubmittedAtDesc();

    List<FeedbackRecord> findByArtefactType(String artefactType);

    long countByDisagreementTrue();
}
