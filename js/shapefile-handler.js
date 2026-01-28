// Shapefile and GeoJSON parsing handler

const ShapefileHandler = {
    async parseFile(file) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.geojson') || name.endsWith('.json')) {
            return this.parseGeoJSON(file);
        } else if (name.endsWith('.zip')) {
            return this.parseShapefile(file);
        } else {
            throw new Error('Unsupported file type. Please upload a .zip shapefile or .geojson file.');
        }
    },

    async parseGeoJSON(file) {
        const text = await file.text();
        const geojson = JSON.parse(text);
        return this.validateAndNormalize(geojson);
    },

    async parseShapefile(file) {
        if (typeof shp === 'undefined') {
            throw new Error('Shapefile library not loaded.');
        }
        const arrayBuffer = await file.arrayBuffer();
        const geojson = await shp(arrayBuffer);
        return this.validateAndNormalize(geojson);
    },

    validateAndNormalize(geojson) {
        // Handle array of feature collections (multi-layer shapefiles)
        if (Array.isArray(geojson)) {
            const features = [];
            geojson.forEach(fc => {
                if (fc.features) features.push(...fc.features);
            });
            geojson = { type: 'FeatureCollection', features };
        }

        // Wrap single feature
        if (geojson.type === 'Feature') {
            geojson = { type: 'FeatureCollection', features: [geojson] };
        }

        // Wrap bare geometry
        if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon' || geojson.type === 'LineString' || geojson.type === 'Point') {
            geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geojson, properties: {} }] };
        }

        if (!geojson.features || geojson.features.length === 0) {
            throw new Error('No features found in the uploaded file.');
        }

        return geojson;
    }
};
