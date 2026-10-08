package com.securenet.gateway.exception;

/** Raised when a referenced scan or feedback record does not exist. */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
