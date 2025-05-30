// license-manager.js - Production-ready license management

const LICENSE_CACHE_KEY = '_lc';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class LicenseManager {
    constructor() {
        this.cachedResult = null;
        this.cacheExpiry = 0;
        this.checking = false;
    }

    async checkLicense() {
        // Return cached result if still valid
        if (this.cachedResult !== null && Date.now() < this.cacheExpiry) {
            return this.cachedResult;
        }

        // Prevent multiple simultaneous checks
        if (this.checking) {
            // Wait for ongoing check
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.checkLicense();
        }

        this.checking = true;

        try {
            // IMPORTANT: Set this to false before publishing!
            const isDevelopment = true; // Developer mode enabled
            
            if (isDevelopment) {
                console.warn('⚠️ DEVELOPMENT MODE - Pro features enabled');
                this.cachedResult = true;
                this.cacheExpiry = Date.now() + CACHE_DURATION;
                return true;
            }

            // Check Chrome Web Store license
            const license = await this.checkChromeWebStoreLicense();
            
            // Cache the result
            this.cachedResult = license;
            this.cacheExpiry = Date.now() + CACHE_DURATION;
            
            // Store encrypted cache
            if (license) {
                await this.storeLicenseCache(license);
            }
            
            return license;
        } catch (error) {
            console.error('License check error:', error);
            // Check cached license on error
            const cached = await this.getCachedLicense();
            return cached;
        } finally {
            this.checking = false;
        }
    }

    async checkChromeWebStoreLicense() {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    resolve(false);
                    return;
                }

                const url = `https://www.googleapis.com/chromewebstore/v1.1/userlicenses/${chrome.runtime.id}`;
                
                fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                .then(response => response.json())
                .then(data => {
                    // Check for valid license
                    const isLicensed = data.result === true || 
                                      data.accessLevel === 'FULL' ||
                                      data.result === 'YES';
                    resolve(isLicensed);
                })
                .catch(error => {
                    console.error('License API error:', error);
                    resolve(false);
                });
            });
        });
    }

    async storeLicenseCache(isLicensed) {
        const data = {
            v: isLicensed,
            t: Date.now(),
            h: this.generateHash(isLicensed + Date.now() + chrome.runtime.id)
        };
        
        const encrypted = btoa(JSON.stringify(data));
        await chrome.storage.local.set({ [LICENSE_CACHE_KEY]: encrypted });
    }

    async getCachedLicense() {
        return new Promise((resolve) => {
            chrome.storage.local.get([LICENSE_CACHE_KEY], (result) => {
                if (!result[LICENSE_CACHE_KEY]) {
                    resolve(false);
                    return;
                }

                try {
                    const decrypted = JSON.parse(atob(result[LICENSE_CACHE_KEY]));
                    
                    // Check if cache is not too old (24 hours)
                    if (Date.now() - decrypted.t > 24 * 60 * 60 * 1000) {
                        resolve(false);
                        return;
                    }

                    resolve(decrypted.v === true);
                } catch (error) {
                    resolve(false);
                }
            });
        });
    }

    generateHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // Clear all license data
    async clearLicense() {
        this.cachedResult = null;
        this.cacheExpiry = 0;
        await chrome.storage.local.remove([LICENSE_CACHE_KEY]);
    }
}

// Create global instance
const licenseManager = new LicenseManager(); 