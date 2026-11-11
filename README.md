# LocalLM Chat

A small desktop app for chatting with the AI models on your phone.

[Local LM](https://locallm.app) runs language models on your Android phone. With **Settings ▸ Serve to other devices** turned on, the phone also serves them to your other devices over your network. LocalLM Chat is a simple way to use them from your computer. Replies are generated on the phone, and nothing leaves your network.

## Download

Get the latest version from [Releases](https://github.com/cguldogan/LMLocal-Chat/releases/latest). These links always download the newest one:

| System | File |
|---|---|
| Mac with Apple silicon (M1 and later) | [`LocalLM-Chat-mac-arm64.dmg`](https://github.com/cguldogan/LMLocal-Chat/releases/latest/download/LocalLM-Chat-mac-arm64.dmg) |
| Mac with Intel | [`LocalLM-Chat-mac-x64.dmg`](https://github.com/cguldogan/LMLocal-Chat/releases/latest/download/LocalLM-Chat-mac-x64.dmg) |
| Windows | [`LocalLM-Chat-win-x64.exe`](https://github.com/cguldogan/LMLocal-Chat/releases/latest/download/LocalLM-Chat-win-x64.exe), or [`LocalLM-Chat-win-arm64.exe`](https://github.com/cguldogan/LMLocal-Chat/releases/latest/download/LocalLM-Chat-win-arm64.exe) for ARM PCs |
| Linux | [`LocalLM-Chat-linux-x86_64.AppImage`](https://github.com/cguldogan/LMLocal-Chat/releases/latest/download/LocalLM-Chat-linux-x86_64.AppImage), or [`LocalLM-Chat-linux-amd64.deb`](https://github.com/cguldogan/LMLocal-Chat/releases/latest/download/LocalLM-Chat-linux-amd64.deb) for Debian and Ubuntu (`arm64` versions too) |

### First launch

The app isn't signed with an Apple or Microsoft certificate yet, so your computer asks before opening it the first time:

- **Mac:** open the app once, and macOS says it can't verify it. Go to **System Settings ▸ Privacy & Security**, scroll down, and click **Open Anyway** next to LocalLM Chat.
- **Windows:** if SmartScreen says "Windows protected your PC", click **More info ▸ Run anyway**.
- **Linux:** make the AppImage executable (`chmod +x LocalLM-Chat-linux-*.AppImage`), then run it.

## Connect to your phone

1. On the phone, open **Local LM ▸ Settings ▸ Serve to other devices** and turn it on. The phone and the computer need to be on the same Wi-Fi, or both on Tailscale.
2. In LocalLM Chat, click **Pair with QR code**. On the phone, tap **Pair the desktop app** and scan the code. The phone sends its address and key, and the app connects.
3. Pick a model and start chatting.

Pairing needs one incoming connection to this computer, so Windows may ask whether to allow LocalLM Chat on private networks: allow it. You can also skip pairing and enter the **base URL** and **API key** the phone shows, such as `http://192.168.1.5:8080`.

The phone answers one request at a time, and its own chats come first. If you start a chat on the phone, the reply on your computer stops with a note saying so.

You don't need this app to chat from a computer: the phone also serves the same chat page at its address. Open `http://<phone-ip>:8080` in any browser.

## Develop

Needs Node.js 22.12 or later.

```sh
npm install
npm start          # run the app
npm run dist       # build installers for this computer into dist/
```

- `ui/index.html` is the whole chat page: one file with no dependencies.
- `main.js` makes the network calls. The page can't call a device on your network directly, so it asks the app through `preload.js`.
- `pairing.js` is QR pairing: it listens briefly for the phone, checks it can reach the phone, then stops.

The Android app serves a copy of `ui/index.html` at the phone's address (`app/src/main/assets/web/index.html` in the Local LM repository). Change the page here, then copy it there.

## Release

Push a version tag and GitHub Actions builds the Mac, Windows and Linux installers and publishes them as a release:

```sh
npm version 0.2.0   # updates package.json and creates the tag v0.2.0
git push --follow-tags
```

To build without publishing, run the **Build** workflow from the Actions tab. The installers are attached to the run.

## License

MIT. See [LICENSE](LICENSE).
