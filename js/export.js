// Data export functionality with weather, KMZ, and PNG support

const ExportManager = {
    formatDuration(startTime, endTime) {
        if (!startTime || !endTime) return 'N/A';

        const start = new Date(startTime);
        const end = new Date(endTime);
        const diffMs = end - start;

        const minutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (hours > 0) {
            return `${hours}h ${remainingMinutes}m`;
        }
        return `${minutes}m`;
    },

    formatTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },

    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString([], {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    formatDateShort(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString();
    },

    groupLogsByDate(logs) {
        const grouped = {};

        logs.forEach(log => {
            const date = log.date || new Date(log.timestamp).toISOString().split('T')[0];
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(log);
        });

        return grouped;
    },

    async renderLogsList() {
        const container = document.getElementById('logs-list');
        if (!container) return;

        try {
            const logs = await StorageDB.getAllLogs();

            if (logs.length === 0) {
                container.innerHTML = '<p class="no-logs">No spreading logs yet.</p>';
                return;
            }

            const grouped = this.groupLogsByDate(logs);
            let html = '';

            Object.keys(grouped).sort().reverse().forEach(date => {
                const dateLogs = grouped[date];
                html += `<div class="log-group">`;
                html += `<div class="log-group-header">${this.formatDate(date + 'T00:00:00')}</div>`;

                dateLogs.forEach(log => {
                    const duration = this.formatDuration(log.timestamp, log.endTime);
                    const time = this.formatTime(log.timestamp);
                    const pointCount = log.path ? log.path.length : 0;
                    const rateInfo = log.targetRate ? `${log.targetRate} gal/ac` : 'N/A';
                    const widthInfo = log.spreadWidth ? `${log.spreadWidth} ft` : '50 ft';

                    html += `
                        <div class="log-item">
                            <span class="log-time">${time}</span>
                            <span class="log-details">
                                ${log.tractorColor} tractor, ${log.manureColor} manure
                                (${pointCount} GPS points)
                            </span>
                            <span class="log-settings">
                                Rate: ${rateInfo} | Width: ${widthInfo}
                            </span>
                            <span class="log-duration">Duration: ${duration}</span>
                        </div>
                    `;
                });

                html += `</div>`;
            });

            container.innerHTML = html;
        } catch (error) {
            console.error('Failed to render logs:', error);
            container.innerHTML = '<p class="no-logs">Error loading logs.</p>';
        }
    },

    // Get center point of logs for weather lookup
    getLogsCenterPoint(logs) {
        let totalLat = 0;
        let totalLng = 0;
        let pointCount = 0;

        logs.forEach(log => {
            if (log.path && log.path.length > 0) {
                log.path.forEach(point => {
                    totalLat += point.lat;
                    totalLng += point.lng;
                    pointCount++;
                });
            }
        });

        if (pointCount === 0) return null;

        return {
            lat: totalLat / pointCount,
            lng: totalLng / pointCount
        };
    },

    async logsToCSV(logs, includeWeather = true) {
        if (logs.length === 0) {
            return 'No logs to export';
        }

        // Fetch weather data if requested
        let weatherData = null;
        let weatherText = '';

        if (includeWeather) {
            const centerPoint = this.getLogsCenterPoint(logs);
            if (centerPoint) {
                weatherData = await WeatherService.getWeatherData(centerPoint.lat, centerPoint.lng);
                if (weatherData) {
                    weatherText = WeatherService.formatForExport(weatherData);
                }
            }
        }

        // Header row
        let csv = 'Date,Start Time,End Time,Duration,Tractor Color,Manure Color,Target Rate (gal/ac),Spread Width (ft),GPS Points,Path Coordinates\n';

        logs.forEach(log => {
            const date = this.formatDateShort(log.timestamp);
            const startTime = this.formatTime(log.timestamp);
            const endTime = log.endTime ? this.formatTime(log.endTime) : 'N/A';
            const duration = this.formatDuration(log.timestamp, log.endTime);
            const pointCount = log.path ? log.path.length : 0;
            const targetRate = log.targetRate || '';
            const spreadWidth = log.spreadWidth || 50;

            // Format path as semicolon-separated coordinate pairs
            const pathStr = log.path
                ? log.path.map(p => `${p.lat};${p.lng}`).join('|')
                : '';

            csv += `"${date}","${startTime}","${endTime}","${duration}","${log.tractorColor}","${log.manureColor}","${targetRate}","${spreadWidth}",${pointCount},"${pathStr}"\n`;
        });

        // Append weather data if available
        if (weatherText) {
            csv += '\n\n' + weatherText;
        }

        return csv;
    },

    logsToJSON(logs) {
        return JSON.stringify(logs, null, 2);
    },

    // Generate KML content for KMZ export
    logsToKML(logs) {
        let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>TeamAg Manure Spreading Logs</name>
    <description>Exported spreading paths</description>

    <Style id="brownPath">
        <LineStyle>
            <color>ff0045ff</color>
            <width>4</width>
        </LineStyle>
        <PolyStyle>
            <color>7f0045ff</color>
        </PolyStyle>
    </Style>

    <Style id="darkBrownPath">
        <LineStyle>
            <color>ff1a3a5d</color>
            <width>4</width>
        </LineStyle>
        <PolyStyle>
            <color>7f1a3a5d</color>
        </PolyStyle>
    </Style>

    <Style id="blackPath">
        <LineStyle>
            <color>ff2d2d2d</color>
            <width>4</width>
        </LineStyle>
        <PolyStyle>
            <color>7f2d2d2d</color>
        </PolyStyle>
    </Style>

    <Style id="greenPath">
        <LineStyle>
            <color>ff237c4a</color>
            <width>4</width>
        </LineStyle>
        <PolyStyle>
            <color>7f237c4a</color>
        </PolyStyle>
    </Style>
`;

        logs.forEach((log, index) => {
            if (!log.path || log.path.length < 2) return;

            const styleId = this.getKMLStyleId(log.manureColor);
            const dateStr = this.formatDate(log.timestamp);
            const timeStr = this.formatTime(log.timestamp);
            const duration = this.formatDuration(log.timestamp, log.endTime);

            // Create placemark for the path
            kml += `
    <Placemark>
        <name>Spreading ${index + 1} - ${dateStr}</name>
        <description>
            Time: ${timeStr}
            Duration: ${duration}
            Tractor: ${log.tractorColor}
            Manure: ${log.manureColor}
            Target Rate: ${log.targetRate || 'N/A'} gal/ac
            Width: ${log.spreadWidth || 50} ft
            GPS Points: ${log.path.length}
        </description>
        <styleUrl>#${styleId}</styleUrl>
        <LineString>
            <tessellate>1</tessellate>
            <coordinates>
`;

            log.path.forEach(point => {
                kml += `                ${point.lng},${point.lat},0\n`;
            });

            kml += `            </coordinates>
        </LineString>
    </Placemark>
`;

            // Create swath polygon if width is available
            const width = log.spreadWidth || 50;
            const swathCoords = this.calculateSwathForKML(log.path, width);

            if (swathCoords.length > 0) {
                kml += `
    <Placemark>
        <name>Swath ${index + 1}</name>
        <styleUrl>#${styleId}</styleUrl>
        <Polygon>
            <tessellate>1</tessellate>
            <outerBoundaryIs>
                <LinearRing>
                    <coordinates>
`;
                swathCoords.forEach(point => {
                    kml += `                        ${point.lng},${point.lat},0\n`;
                });
                // Close the polygon
                kml += `                        ${swathCoords[0].lng},${swathCoords[0].lat},0\n`;
                kml += `                    </coordinates>
                </LinearRing>
            </outerBoundaryIs>
        </Polygon>
    </Placemark>
`;
            }
        });

        kml += `</Document>
</kml>`;

        return kml;
    },

    getKMLStyleId(manureColor) {
        const styles = {
            brown: 'brownPath',
            'dark-brown': 'darkBrownPath',
            black: 'blackPath',
            green: 'greenPath'
        };
        return styles[manureColor] || 'brownPath';
    },

    calculateSwathForKML(path, widthFeet) {
        if (path.length < 2) return [];

        const halfWidthMeters = widthFeet * 0.3048 / 2;
        const leftSide = [];
        const rightSide = [];

        for (let i = 0; i < path.length; i++) {
            const current = path[i];
            let bearing;

            if (i === 0) {
                const next = path[i + 1];
                bearing = this.calculateBearing(current.lat, current.lng, next.lat, next.lng);
            } else if (i === path.length - 1) {
                const prev = path[i - 1];
                bearing = this.calculateBearing(prev.lat, prev.lng, current.lat, current.lng);
            } else {
                const prev = path[i - 1];
                const next = path[i + 1];
                const bearingIn = this.calculateBearing(prev.lat, prev.lng, current.lat, current.lng);
                const bearingOut = this.calculateBearing(current.lat, current.lng, next.lat, next.lng);
                bearing = (bearingIn + bearingOut) / 2;
            }

            const leftPoint = this.destinationPoint(current.lat, current.lng, bearing + 90, halfWidthMeters);
            const rightPoint = this.destinationPoint(current.lat, current.lng, bearing - 90, halfWidthMeters);

            leftSide.push(leftPoint);
            rightSide.push(rightPoint);
        }

        return [...leftSide, ...rightSide.reverse()];
    },

    calculateBearing(lat1, lng1, lat2, lng2) {
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;

        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    },

    destinationPoint(lat, lng, bearing, distanceMeters) {
        const R = 6371000;
        const d = distanceMeters / R;
        const brng = bearing * Math.PI / 180;
        const lat1 = lat * Math.PI / 180;
        const lng1 = lng * Math.PI / 180;

        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(d) +
            Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
        );

        const lng2 = lng1 + Math.atan2(
            Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
            Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
        );

        return {
            lat: lat2 * 180 / Math.PI,
            lng: lng2 * 180 / Math.PI
        };
    },

    // Create KMZ file (zipped KML)
    async createKMZ(kmlContent) {
        // For browser compatibility, we'll create a simple KMZ using JSZip-like approach
        // Since we can't include JSZip, we'll export as KML instead or use basic compression

        // Convert KML to blob
        const kmlBlob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });

        // Try to use CompressionStream if available (modern browsers)
        if (typeof CompressionStream !== 'undefined') {
            try {
                // Create a simple ZIP structure manually
                const zipData = await this.createSimpleZip('doc.kml', kmlContent);
                return new Blob([zipData], { type: 'application/vnd.google-earth.kmz' });
            } catch (e) {
                console.warn('KMZ compression failed, falling back to KML:', e);
            }
        }

        // Fallback: return KML blob with kmz extension (most apps will still open it)
        return kmlBlob;
    },

    // Simple ZIP file creator for KMZ
    async createSimpleZip(filename, content) {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);

        // Create a minimal ZIP file structure
        const crc32 = this.calculateCRC32(data);
        const fileHeader = this.createZipFileHeader(filename, data.length, crc32);
        const centralDir = this.createZipCentralDirectory(filename, data.length, crc32, 0);
        const endOfCentralDir = this.createZipEndOfCentralDirectory(1, centralDir.length, fileHeader.length + data.length);

        // Combine all parts
        const zipBuffer = new Uint8Array(fileHeader.length + data.length + centralDir.length + endOfCentralDir.length);
        let offset = 0;
        zipBuffer.set(fileHeader, offset); offset += fileHeader.length;
        zipBuffer.set(data, offset); offset += data.length;
        zipBuffer.set(centralDir, offset); offset += centralDir.length;
        zipBuffer.set(endOfCentralDir, offset);

        return zipBuffer;
    },

    createZipFileHeader(filename, size, crc32) {
        const encoder = new TextEncoder();
        const filenameBytes = encoder.encode(filename);
        const header = new Uint8Array(30 + filenameBytes.length);
        const view = new DataView(header.buffer);

        view.setUint32(0, 0x04034b50, true); // Local file header signature
        view.setUint16(4, 20, true); // Version needed
        view.setUint16(6, 0, true); // Flags
        view.setUint16(8, 0, true); // Compression (none)
        view.setUint16(10, 0, true); // Mod time
        view.setUint16(12, 0, true); // Mod date
        view.setUint32(14, crc32, true); // CRC32
        view.setUint32(18, size, true); // Compressed size
        view.setUint32(22, size, true); // Uncompressed size
        view.setUint16(26, filenameBytes.length, true); // Filename length
        view.setUint16(28, 0, true); // Extra field length
        header.set(filenameBytes, 30);

        return header;
    },

    createZipCentralDirectory(filename, size, crc32, headerOffset) {
        const encoder = new TextEncoder();
        const filenameBytes = encoder.encode(filename);
        const dir = new Uint8Array(46 + filenameBytes.length);
        const view = new DataView(dir.buffer);

        view.setUint32(0, 0x02014b50, true); // Central directory signature
        view.setUint16(4, 20, true); // Version made by
        view.setUint16(6, 20, true); // Version needed
        view.setUint16(8, 0, true); // Flags
        view.setUint16(10, 0, true); // Compression
        view.setUint16(12, 0, true); // Mod time
        view.setUint16(14, 0, true); // Mod date
        view.setUint32(16, crc32, true); // CRC32
        view.setUint32(20, size, true); // Compressed size
        view.setUint32(24, size, true); // Uncompressed size
        view.setUint16(28, filenameBytes.length, true); // Filename length
        view.setUint16(30, 0, true); // Extra field length
        view.setUint16(32, 0, true); // Comment length
        view.setUint16(34, 0, true); // Disk number
        view.setUint16(36, 0, true); // Internal attributes
        view.setUint32(38, 0, true); // External attributes
        view.setUint32(42, headerOffset, true); // Header offset
        dir.set(filenameBytes, 46);

        return dir;
    },

    createZipEndOfCentralDirectory(numEntries, centralDirSize, centralDirOffset) {
        const end = new Uint8Array(22);
        const view = new DataView(end.buffer);

        view.setUint32(0, 0x06054b50, true); // End of central directory signature
        view.setUint16(4, 0, true); // Disk number
        view.setUint16(6, 0, true); // Central directory disk
        view.setUint16(8, numEntries, true); // Entries on disk
        view.setUint16(10, numEntries, true); // Total entries
        view.setUint32(12, centralDirSize, true); // Central directory size
        view.setUint32(16, centralDirOffset, true); // Central directory offset
        view.setUint16(20, 0, true); // Comment length

        return end;
    },

    calculateCRC32(data) {
        let crc = 0xffffffff;
        const table = this.getCRC32Table();

        for (let i = 0; i < data.length; i++) {
            crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
        }

        return (crc ^ 0xffffffff) >>> 0;
    },

    getCRC32Table() {
        if (!this._crc32Table) {
            this._crc32Table = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let j = 0; j < 8; j++) {
                    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
                }
                this._crc32Table[i] = c;
            }
        }
        return this._crc32Table;
    },

    // Generate PNG map image
    async generateMapPNG(logs) {
        // Create a temporary map container
        const container = document.createElement('div');
        container.style.width = '1200px';
        container.style.height = '800px';
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        document.body.appendChild(container);

        // Create map
        const map = L.map(container, {
            zoomControl: false,
            attributionControl: false
        });

        // Add satellite tiles
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        }).addTo(map);

        // Add paths from logs
        const allCoords = [];
        logs.forEach(log => {
            if (!log.path || log.path.length < 2) return;

            const coords = log.path.map(p => [p.lat, p.lng]);
            allCoords.push(...coords);

            const color = this.getManureColor(log.manureColor);

            // Add swath
            const swathCoords = this.calculateSwathForKML(log.path, log.spreadWidth || 50);
            if (swathCoords.length > 0) {
                L.polygon(swathCoords.map(p => [p.lat, p.lng]), {
                    color: color,
                    weight: 1,
                    opacity: 0.5,
                    fillColor: color,
                    fillOpacity: 0.5
                }).addTo(map);
            }

            // Add center line
            L.polyline(coords, {
                color: color,
                weight: 4,
                opacity: 1
            }).addTo(map);
        });

        // Fit bounds
        if (allCoords.length > 0) {
            map.fitBounds(L.latLngBounds(allCoords), { padding: [50, 50] });
        }

        // Wait for tiles to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Use html2canvas-like approach or leaflet-image
        // Since we don't have external libraries, create a simple canvas representation
        try {
            // Get the map container
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = 800;
            const ctx = canvas.getContext('2d');

            // Draw a placeholder with path info
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Add logo area
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(20, 20, 200, 60);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px Arial';
            ctx.fillText('TeamAg', 40, 55);
            ctx.font = '12px Arial';
            ctx.fillText('Manure Spreading', 40, 72);

            // Add info
            ctx.fillStyle = '#fff';
            ctx.font = '16px Arial';
            ctx.fillText(`Spreading Logs Export`, 20, 120);
            ctx.fillText(`Total Sessions: ${logs.length}`, 20, 145);
            ctx.fillText(`Total GPS Points: ${logs.reduce((sum, l) => sum + (l.path?.length || 0), 0)}`, 20, 170);

            // Note about map
            ctx.fillStyle = '#aaa';
            ctx.font = '14px Arial';
            ctx.fillText('Note: For full map visualization, use KMZ export with Google Earth', 20, 220);
            ctx.fillText('or view paths in the app.', 20, 240);

            // Draw simplified paths
            if (allCoords.length > 0) {
                const bounds = this.calculateBounds(allCoords);
                const scale = Math.min(
                    (canvas.width - 100) / (bounds.maxLng - bounds.minLng),
                    (canvas.height - 300) / (bounds.maxLat - bounds.minLat)
                ) * 0.8;

                logs.forEach(log => {
                    if (!log.path || log.path.length < 2) return;

                    ctx.strokeStyle = this.getManureColor(log.manureColor);
                    ctx.lineWidth = 3;
                    ctx.beginPath();

                    log.path.forEach((point, i) => {
                        const x = 50 + (point.lng - bounds.minLng) * scale;
                        const y = canvas.height - 100 - (point.lat - bounds.minLat) * scale;

                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    });

                    ctx.stroke();
                });
            }

            // Convert to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

            // Cleanup
            map.remove();
            document.body.removeChild(container);

            return blob;
        } catch (error) {
            console.error('PNG generation failed:', error);
            map.remove();
            document.body.removeChild(container);
            throw error;
        }
    },

    calculateBounds(coords) {
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        coords.forEach(([lat, lng]) => {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        });

        return { minLat, maxLat, minLng, maxLng };
    },

    getManureColor(color) {
        const colors = {
            brown: '#8b4513',
            'dark-brown': '#5d3a1a',
            black: '#2d2d2d',
            green: '#4a7c23'
        };
        return colors[color] || colors.brown;
    },

    downloadFile(content, filename, mimeType) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    },

    async shareOrDownload(logs, filename, format = 'csv', includeWeather = true) {
        let content;
        let mimeType;
        let extension;

        switch (format) {
            case 'kmz':
                const kml = this.logsToKML(logs);
                content = await this.createKMZ(kml);
                mimeType = 'application/vnd.google-earth.kmz';
                extension = 'kmz';
                break;

            case 'png':
                content = await this.generateMapPNG(logs);
                mimeType = 'image/png';
                extension = 'png';
                break;

            case 'csv':
            default:
                content = await this.logsToCSV(logs, includeWeather);
                mimeType = 'text/csv';
                extension = 'csv';
                break;
        }

        // Try Web Share API first (for mobile) - only for CSV
        if (format === 'csv' && navigator.share && navigator.canShare) {
            const file = new File([content], `${filename}.${extension}`, { type: mimeType });

            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: 'Manure Spreading Logs',
                        text: `Spreading logs export - ${logs.length} records`,
                        files: [file]
                    });
                    return { success: true, method: 'share' };
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.log('Share failed, falling back to download');
                    }
                }
            }
        }

        // Fall back to download
        this.downloadFile(content, `${filename}.${extension}`, mimeType);
        return { success: true, method: 'download' };
    },

    async exportAllLogs() {
        try {
            const logs = await StorageDB.getAllLogs();

            if (logs.length === 0) {
                alert('No logs to export.');
                return;
            }

            const format = document.getElementById('export-format')?.value || 'csv';
            const includeWeather = document.getElementById('include-weather')?.checked ?? true;
            const date = new Date().toISOString().split('T')[0];
            const filename = `manure-spreading-all-${date}`;

            const result = await this.shareOrDownload(logs, filename, format, includeWeather);

            if (result.method === 'download') {
                alert(`Downloaded ${logs.length} log(s) as ${format.toUpperCase()} file.`);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export logs. Please try again.');
        }
    },

    async exportTodaysLogs() {
        try {
            const logs = await StorageDB.getTodaysLogs();

            if (logs.length === 0) {
                alert('No logs from today to export.');
                return;
            }

            const format = document.getElementById('export-format')?.value || 'csv';
            const includeWeather = document.getElementById('include-weather')?.checked ?? true;
            const date = new Date().toISOString().split('T')[0];
            const filename = `manure-spreading-${date}`;

            const result = await this.shareOrDownload(logs, filename, format, includeWeather);

            if (result.method === 'download') {
                alert(`Downloaded ${logs.length} log(s) from today as ${format.toUpperCase()} file.`);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export logs. Please try again.');
        }
    }
};
