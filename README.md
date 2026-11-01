# Build Litefin Continuous Trickplay from Windows — browser-only method

**No Linux PC, Android Studio, local Node.js, Git, Rust, or Android SDK required.** The GitHub Actions workflow checks out Litefin v2.0.20, applies the included experimental source patch, tests the logic, and attempts an Android debug build on GitHub's Linux runner.

**Status:** untested workflow and uncompiled APK. This is a build kit, not an actual APK. GitHub Actions may expose environment or version mismatches that need fixing.

## First-time setup

1. Sign into [GitHub](https://github.com/) on your Windows PC.
2. Create a **new empty repository** (for example, `litefin-trickplay-test`). **Private** is fine. Use the default branch (`main`). Do not create a README/license/gitignore in the GitHub setup screen; this kit already contains its own README.
3. Download the ZIP attached in ChatGPT, then right-click it in Windows Explorer → **Extract All**.
4. In your empty GitHub repository click **uploading an existing file** (or **Add file → Upload files**).
5. From the extracted directory, **drag all the files and subdirectories INSIDE it** into GitHub's upload drop zone (including `.github`). Preserve the folder paths `src/`, `tests/`, and `.github/workflows/`; don't upload the ZIP by itself or upload one enclosing parent folder. Commit the upload to `main`.
6. Open the repo's **Actions** tab. If GitHub asks to enable Actions for this repository, enable it.
7. Open **Build Litefin Trickplay Test APK** → **Run workflow** → Run workflow (default `main`). Note: the workflow must exist on the default branch for the button to appear.
8. When the build succeeds, open the run → **Artifacts** → download `litefin-trickplay-v0.1-android-debug`. Extract the resulting ZIP to find `.apk`.
9. Transfer/sideload the APK to Android TV using your existing method (USB, Send Files to TV, or ADB). It uses the distinct debug Android package ID suffix `.trickplaytest` to avoid replacing official Litefin.

## Expected playback behavior

- FF and REW start continuous visual scanning at 4×.
- Repeated separate presses advance 8×, 16×, 32×.
- Pressing the opposite direction scans at 4× the other way.
- Play or OK commits the scanned position; Back cancels.
- D-pad Left/Right retains Litefin's usual seek behavior.
- Jellyfin trickplay image previews require the Jellyfin server to have generated trickplay images.

## If the workflow fails

Open Actions → the failed run → **Patch upstream Litefin source**, **Install Android SDK and NDK**, **Install Litefin dependencies**, or **Compile universal Android debug APK** (whichever has a red X). Copy the last ~50 relevant lines of the failed step into ChatGPT. Do not guess or change random SDK versions. The code patch checks for exact v2.0.20 source anchors and deliberately fails if upstream no longer matches.

If your upload lacks `.github/workflows/trickplay-android.yml`, the Actions run button will not exist. Check that the workflow file appears inside the GitHub repo at exactly that path.

## Signing and updates

The APK is a one-shot debug test. Each cloud build can use a different debug signing key. For subsequent in-place upgrades without clearing the app's data, the build process will need a persistent secure signing key. For now, the official Litefin installation is unaffected.

## Limitations

- Browser-only process requires a GitHub account and an internet connection; using GitHub Actions may count against your account's free/build minutes.
- The actual Android build is not yet verified. The GitHub workflow is meant to reveal (and then fix) any remaining build issues before device testing.
- This is an integrated client source patch, not an externally loadable plugin.
- The 4×/8×/16×/32× simulation advances the preview position and does not decode video backward at that rate.
