// Weather data fetching using Open-Meteo API (free, no API key required)

const WeatherService = {
    // Cache weather data to avoid excessive API calls
    cache: {},
    cacheExpiry: 30 * 60 * 1000, // 30 minutes

    // Get weather data for a location
    async getWeatherData(lat, lng) {
        const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;

        // Check cache
        if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].timestamp < this.cacheExpiry) {
            return this.cache[cacheKey].data;
        }

        try {
            // Fetch current weather, past 3 days, and forecast for next 3 days
            const today = new Date();
            const threeDaysAgo = new Date(today);
            threeDaysAgo.setDate(today.getDate() - 3);
            const threeDaysAhead = new Date(today);
            threeDaysAhead.setDate(today.getDate() + 3);

            const startDate = threeDaysAgo.toISOString().split('T')[0];
            const endDate = threeDaysAhead.toISOString().split('T')[0];

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&current=temperature_2m,relative_humidity_2m,precipitation,weathercode,wind_speed_10m&timezone=auto&start_date=${startDate}&end_date=${endDate}`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }

            const data = await response.json();
            const weatherData = this.processWeatherData(data);

            // Cache the result
            this.cache[cacheKey] = {
                timestamp: Date.now(),
                data: weatherData
            };

            return weatherData;
        } catch (error) {
            console.error('Failed to fetch weather data:', error);
            return null;
        }
    },

    processWeatherData(data) {
        const today = new Date().toISOString().split('T')[0];
        const dailyData = data.daily;
        const currentData = data.current;

        // Find today's index in the daily data
        const todayIndex = dailyData.time.indexOf(today);

        // Process past 3 days, today, and next 3 days
        const pastDays = [];
        const futureDays = [];

        dailyData.time.forEach((date, index) => {
            const dayData = {
                date: date,
                dateFormatted: this.formatDate(date),
                tempMax: dailyData.temperature_2m_max[index],
                tempMin: dailyData.temperature_2m_min[index],
                precipitation: dailyData.precipitation_sum[index],
                weatherCode: dailyData.weathercode[index],
                weatherDescription: this.getWeatherDescription(dailyData.weathercode[index])
            };

            if (index < todayIndex) {
                pastDays.push(dayData);
            } else if (index > todayIndex) {
                futureDays.push(dayData);
            }
        });

        // Current/today's weather
        const todayWeather = {
            date: today,
            dateFormatted: this.formatDate(today),
            tempMax: dailyData.temperature_2m_max[todayIndex],
            tempMin: dailyData.temperature_2m_min[todayIndex],
            tempCurrent: currentData.temperature_2m,
            precipitation: dailyData.precipitation_sum[todayIndex],
            humidity: currentData.relative_humidity_2m,
            windSpeed: currentData.wind_speed_10m,
            weatherCode: currentData.weathercode,
            weatherDescription: this.getWeatherDescription(currentData.weathercode)
        };

        return {
            current: todayWeather,
            pastDays: pastDays.slice(-3), // Last 3 days
            forecast: futureDays.slice(0, 3), // Next 3 days
            timezone: data.timezone,
            fetchedAt: new Date().toISOString()
        };
    },

    formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    },

    // Convert WMO weather codes to descriptions
    getWeatherDescription(code) {
        const descriptions = {
            0: 'Clear sky',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Foggy',
            48: 'Depositing rime fog',
            51: 'Light drizzle',
            53: 'Moderate drizzle',
            55: 'Dense drizzle',
            56: 'Light freezing drizzle',
            57: 'Dense freezing drizzle',
            61: 'Slight rain',
            63: 'Moderate rain',
            65: 'Heavy rain',
            66: 'Light freezing rain',
            67: 'Heavy freezing rain',
            71: 'Slight snow',
            73: 'Moderate snow',
            75: 'Heavy snow',
            77: 'Snow grains',
            80: 'Slight rain showers',
            81: 'Moderate rain showers',
            82: 'Violent rain showers',
            85: 'Slight snow showers',
            86: 'Heavy snow showers',
            95: 'Thunderstorm',
            96: 'Thunderstorm with slight hail',
            99: 'Thunderstorm with heavy hail'
        };
        return descriptions[code] || 'Unknown';
    },

    // Convert Celsius to Fahrenheit
    celsiusToFahrenheit(celsius) {
        return (celsius * 9/5) + 32;
    },

    // Format weather data for export
    formatForExport(weatherData) {
        if (!weatherData) {
            return 'Weather data not available';
        }

        let output = '=== WEATHER DATA ===\n\n';

        // Past 3 days
        output += '--- PAST 3 DAYS ---\n';
        weatherData.pastDays.forEach(day => {
            output += `${day.dateFormatted}:\n`;
            output += `  High: ${this.celsiusToFahrenheit(day.tempMax).toFixed(1)}°F / Low: ${this.celsiusToFahrenheit(day.tempMin).toFixed(1)}°F\n`;
            output += `  Precipitation: ${day.precipitation.toFixed(2)} mm\n`;
            output += `  Conditions: ${day.weatherDescription}\n\n`;
        });

        // Today
        output += '--- TODAY ---\n';
        const today = weatherData.current;
        output += `${today.dateFormatted}:\n`;
        output += `  Current Temp: ${this.celsiusToFahrenheit(today.tempCurrent).toFixed(1)}°F\n`;
        output += `  High: ${this.celsiusToFahrenheit(today.tempMax).toFixed(1)}°F / Low: ${this.celsiusToFahrenheit(today.tempMin).toFixed(1)}°F\n`;
        output += `  Precipitation: ${today.precipitation.toFixed(2)} mm\n`;
        output += `  Humidity: ${today.humidity}%\n`;
        output += `  Wind Speed: ${(today.windSpeed * 0.621371).toFixed(1)} mph\n`;
        output += `  Conditions: ${today.weatherDescription}\n\n`;

        // Forecast
        output += '--- 3-DAY FORECAST ---\n';
        weatherData.forecast.forEach(day => {
            output += `${day.dateFormatted}:\n`;
            output += `  High: ${this.celsiusToFahrenheit(day.tempMax).toFixed(1)}°F / Low: ${this.celsiusToFahrenheit(day.tempMin).toFixed(1)}°F\n`;
            output += `  Expected Precipitation: ${day.precipitation.toFixed(2)} mm\n`;
            output += `  Conditions: ${day.weatherDescription}\n\n`;
        });

        output += `Weather data fetched: ${new Date(weatherData.fetchedAt).toLocaleString()}\n`;
        output += `Timezone: ${weatherData.timezone}\n`;

        return output;
    },

    // Format weather data as JSON for CSV/structured export
    formatAsJSON(weatherData) {
        if (!weatherData) {
            return null;
        }

        return {
            pastDays: weatherData.pastDays.map(day => ({
                date: day.date,
                highF: this.celsiusToFahrenheit(day.tempMax).toFixed(1),
                lowF: this.celsiusToFahrenheit(day.tempMin).toFixed(1),
                precipMm: day.precipitation.toFixed(2),
                conditions: day.weatherDescription
            })),
            today: {
                date: weatherData.current.date,
                currentF: this.celsiusToFahrenheit(weatherData.current.tempCurrent).toFixed(1),
                highF: this.celsiusToFahrenheit(weatherData.current.tempMax).toFixed(1),
                lowF: this.celsiusToFahrenheit(weatherData.current.tempMin).toFixed(1),
                precipMm: weatherData.current.precipitation.toFixed(2),
                humidity: weatherData.current.humidity,
                windMph: (weatherData.current.windSpeed * 0.621371).toFixed(1),
                conditions: weatherData.current.weatherDescription
            },
            forecast: weatherData.forecast.map(day => ({
                date: day.date,
                highF: this.celsiusToFahrenheit(day.tempMax).toFixed(1),
                lowF: this.celsiusToFahrenheit(day.tempMin).toFixed(1),
                precipMm: day.precipitation.toFixed(2),
                conditions: day.weatherDescription
            }))
        };
    }
};
