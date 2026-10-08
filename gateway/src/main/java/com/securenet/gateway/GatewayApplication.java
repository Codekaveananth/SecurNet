package com.securenet.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * SecureNet API gateway.
 *
 * The gateway owns everything the ML microservice deliberately does not:
 * request validation, persistence of scan history, the analyst feedback loop,
 * caching, and a single stable contract for the frontend. Keeping the Python
 * service stateless means it can be scaled or retrained independently.
 */
@SpringBootApplication
public class GatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
