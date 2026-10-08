package com.securenet.gateway.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.securenet.gateway.model.ScanRecord;

@Repository
public interface ScanRecordRepository extends JpaRepository<ScanRecord, Long> {

    Optional<ScanRecord> findFirstByArtefactHashOrderByScannedAtDesc(String artefactHash);

    /**
     * Cache lookup scoped to one user.
     *
     * The unscoped lookup above must NOT be used to serve a signed-in user, or
     * one user's stored scan would be handed to another and appear in their
     * history. Anonymous requests (userId null) use findFirstByArtefactHash...
     * with a null user instead.
     */
    Optional<ScanRecord> findFirstByArtefactHashAndUserIdOrderByScannedAtDesc(
            String artefactHash, Long userId);

    Optional<ScanRecord> findFirstByArtefactHashAndUserIdIsNullOrderByScannedAtDesc(
            String artefactHash);

    List<ScanRecord> findAllByOrderByScannedAtDesc(Pageable pageable);

    List<ScanRecord> findByUserIdOrderByScannedAtDesc(Long userId, Pageable pageable);

    List<ScanRecord> findByArtefactTypeOrderByScannedAtDesc(String artefactType, Pageable pageable);

    long countByVerdict(String verdict);

    long countByArtefactType(String artefactType);

    long countByUserId(Long userId);

    long countByUserIdAndVerdict(Long userId, String verdict);

    long countByUserIdAndArtefactType(Long userId, String artefactType);

    @Query("select avg(s.latencyMs) from ScanRecord s "
            + "where s.artefactType = :type and s.userId = :userId")
    Double averageLatencyForUser(@Param("type") String type, @Param("userId") Long userId);

    @Query("select count(s) from ScanRecord s where s.scannedAt >= :since")
    long countSince(@Param("since") Instant since);

    @Query("select avg(s.latencyMs) from ScanRecord s where s.artefactType = :type")
    Double averageLatency(@Param("type") String type);
}
