package com.securenet.gateway.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Inbound scan request from the frontend. */
public class ScanRequest {

    @NotBlank(message = "artefact must not be blank")
    @Size(max = 4000, message = "artefact exceeds 4000 characters")
    private String artefact;

    public ScanRequest() {
    }

    public ScanRequest(String artefact) {
        this.artefact = artefact;
    }

    public String getArtefact() {
        return artefact;
    }

    public void setArtefact(String artefact) {
        this.artefact = artefact;
    }
}
