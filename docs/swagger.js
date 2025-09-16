// docs/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'ABN Monitoring API',
            version: '1.0.0',
            description: 'Dokumentasi REST API ABN Monitoring System'
        },
        servers: [{
            url: BASE_URL,
            description: 'Local Server'
        }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        },
        security: [{
            bearerAuth: []
        }]
    },
    apis: ['./docs/paths/*.yaml'], // baca semua file YAML di /paths
};

module.exports = swaggerJsdoc(options);