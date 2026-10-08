package com.securenet.gateway.exception;

/** Raised when the Python ML microservice is unreachable or returns an error. */
public class MlServiceException extends RuntimeException {

    public MlServiceException(String message) {
        super(message);
    }

    public MlServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
