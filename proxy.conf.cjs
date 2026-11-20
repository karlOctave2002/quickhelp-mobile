const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

// Carga el archivo .env desde la raíz del proyecto.
const archivoEnv = resolve(__dirname, '.env');

if (existsSync(archivoEnv)) {
    process.loadEnvFile(archivoEnv);
}

const clave = process.env.QUICKHELP_MAPS_KEY?.trim();

if (!clave) {
    throw new Error('Falta QUICKHELP_MAPS_KEY en el archivo .env.');
}

module.exports = {
    '/v4/geocode/location/**': {
        target: 'https://geocode.googleapis.com',
        changeOrigin: true,
        secure: true,
        // El servidor de desarrollo agrega la clave a la consulta.
        headers: {
            'X-Goog-Api-Key': clave,
        },
    },
};