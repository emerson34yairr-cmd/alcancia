# Mi Alcancia iOS Wrapper

This workspace now includes a Capacitor iOS wrapper for the single-file Mi Alcancia web app.

## Local Web Source

- Original app file: `index.html.html`
- Capacitor web bundle: `www/index.html`
- iOS copied bundle: `ios/App/App/public/index.html`

The current copied files match the original HTML by SHA256.

## Build On macOS

1. Install Node dependencies:

   ```bash
   npm install
   ```

2. Copy/sync the latest web assets:

   ```bash
   npx cap sync ios
   ```

3. Install CocoaPods if needed:

   ```bash
   sudo gem install cocoapods
   ```

4. Install iOS pods:

   ```bash
   cd ios/App
   pod install
   ```

5. Open the Xcode workspace:

   ```bash
   open App.xcworkspace
   ```

6. In Xcode, select the `App` scheme and run on an iPhone simulator or device.

## Current Windows Limitation

The wrapper files can be generated on Windows, but compiling and running the iOS app requires macOS with Xcode, `xcodebuild`, and CocoaPods.
