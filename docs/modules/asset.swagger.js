const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Asset Module API',
            version: '1.0.0',
            description: 'Dokumentasi modul Asset'
        },
        servers: [{
            url: 'http://localhost:3002',
            description: 'Local server'
        }],
        components: {},
        paths: {}
    },
    apis: [
        './docs/paths/Asset.yaml',
        './docs/components/schemas/Asset.yaml'
    ]
};

const spec = swaggerJsdoc(options);

module.exports = {
    spec,
    route: '/api-docs/asset'
};