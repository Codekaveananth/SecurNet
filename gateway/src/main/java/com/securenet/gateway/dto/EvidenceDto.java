package com.securenet.gateway.dto;

/** One attribution on the explanation axis, mirrored from the ML service. */
public class EvidenceDto {

    private String feature;
    private Double value;
    private Double contribution;
    private String direction;
    private String description;

    public String getFeature() { return feature; }
    public void setFeature(String feature) { this.feature = feature; }

    public Double getValue() { return value; }
    public void setValue(Double value) { this.value = value; }

    public Double getContribution() { return contribution; }
    public void setContribution(Double contribution) { this.contribution = contribution; }

    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
