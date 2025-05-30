# HTTPScanr - HTTP Status Code & Redirect Checker

A powerful Chrome extension for checking HTTP status codes and tracking redirects for any URL. Perfect for SEO professionals, web developers, and anyone who needs to monitor URL health.

## Features

### Free Version
- Check HTTP status codes for any URL
- Track redirect chains
- View detailed response information
- Basic URL validation
- Up to 100 URL checks per day

### Pro Version
- Unlimited URL checks
- Google Sheets integration
- Export results to spreadsheets

## Installation

1. Visit the [Chrome Web Store](https://chrome.google.com/webstore/detail/httpscanr/extension-id)
2. Click "Add to Chrome"
3. Pin the extension to your toolbar for easy access

## Usage

1. Click the HTTPScanr icon in your Chrome toolbar
2. Enter the URL you want to check
3. Click "Check URL" or press Enter
4. View the results in the popup window

### Pro Features

#### Google Sheets Integration
1. Go to Settings
2. Click "Connect Google Account"
3. Authorize the extension
4. Use the "Export to Sheets" button in results

## Development

### Prerequisites
- Node.js
- Chrome Browser
- Google Cloud Console account (for OAuth)

### Setup
1. Clone the repository
```bash
git clone https://github.com/yourusername/httpscanr.git
```

2. Install dependencies
```bash
npm install
```

3. Load the extension in Chrome
- Open Chrome
- Go to `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select the extension directory

### Building
```bash
npm run build
```

## Security

- All license checks are performed securely
- No data is stored on external servers
- Google OAuth is used for authentication
- All sensitive data is encrypted

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please:
1. Check the [documentation](docs/)
2. Open an issue on GitHub
3. Contact support@httpscanr.com

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Acknowledgments

- Chrome Extension API
- Google Sheets API
- Bootstrap for UI components
- Font Awesome for icons

## Version History

- 1.0.0
  - Initial release
  - Basic URL checking
  - Pro features
  - Google Sheets integration

## Roadmap

- [ ] Batch URL checking
- [ ] API integration
- [ ] Custom export formats
- [ ] Advanced analytics
- [ ] Team collaboration features 