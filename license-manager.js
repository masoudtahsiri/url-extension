// license-manager.js - Gumroad License Management

const LICENSE_KEY_STORAGE = 'httpscanr_license_key';
const LICENSE_CACHE_KEY = '_lc';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const isDevelopment = false; // Developer mode disabled for production

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
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.checkLicense();
        }

        this.checking = true;

        try {
            // Check for stored license key
            const result = await chrome.storage.sync.get([LICENSE_KEY_STORAGE]);
            const licenseKey = result[LICENSE_KEY_STORAGE];
            
            if (!licenseKey) {
                this.cachedResult = false;
                this.cacheExpiry = Date.now() + CACHE_DURATION;
                return false;
            }

            // Validate license key format
            const isValid = await this.validateLicenseKey(licenseKey);
            
            // Cache the result
            this.cachedResult = isValid;
            this.cacheExpiry = Date.now() + CACHE_DURATION;
            
            return isValid;
        } catch (error) {
            console.error('License check error:', error);
            return false;
        } finally {
            this.checking = false;
        }
    }

    async validateLicenseKey(key) {
        // Basic format validation for Gumroad-style keys
        // Format: HTTPSCANR-XXXX-XXXX-XXXX
        const gumroadPattern = /^HTTPSCANR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        
        if (!gumroadPattern.test(key)) {
            return false;
        }

        // Optional: Add additional validation logic here
        // For now, we'll accept any properly formatted key
        // In production, you might want to validate against a server
        
        return true;
    }

    async activateLicense(licenseKey) {
        // Clean and validate the license key
        const cleanKey = licenseKey.trim().toUpperCase();
        
        // Validate format
        const isValid = await this.validateLicenseKey(cleanKey);
        
        if (!isValid) {
            throw new Error('Invalid license key format');
        }

        // Store the license key
        await chrome.storage.sync.set({
            [LICENSE_KEY_STORAGE]: cleanKey
        });

        // Clear cache to force recheck
        this.cachedResult = null;
        this.cacheExpiry = 0;

        // Initialize stats for new Pro user
        await chrome.storage.local.set({ 
            _tc: btoa('0'), // Encrypted total checks
            _se: btoa('0')  // Encrypted sheets exports
        });

        return true;
    }

    async deactivateLicense() {
        // Remove license key
        await chrome.storage.sync.remove([LICENSE_KEY_STORAGE]);
        
        // Clear cache
        this.cachedResult = null;
        this.cacheExpiry = 0;
    }

    async getCurrentLicense() {
        const result = await chrome.storage.sync.get([LICENSE_KEY_STORAGE]);
        return result[LICENSE_KEY_STORAGE] || null;
    }

    // Clear all license data
    async clearLicense() {
        this.cachedResult = null;
        this.cacheExpiry = 0;
        await chrome.storage.sync.remove([LICENSE_KEY_STORAGE]);
        await chrome.storage.local.remove([LICENSE_CACHE_KEY]);
    }
}

// Create global instance
const licenseManager = new LicenseManager(); 