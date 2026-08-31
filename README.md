# 🤖 Google Play Console MCP Server

[![npm version](https://img.shields.io/npm/v/gpc-mcp-server.svg)](https://npmjs.org/package/gpc-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io/)

A powerful [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI Assistants (like Claude, Gemini, or any MCP client) to directly manage your Google Play Console. 

Stop clicking through slow web interfaces to release your app. **Just ask your AI agent to do it.**

> "Claude, what's the crash rate on production?"
> "Gemini, create a new internal release and update the release notes."
> "Claude, list 1-star reviews from today and reply to them asking for details."

---

## 🌟 Key Features

*   🚀 **Release Management:** Create releases, manage tracks, update release notes, and control staged rollouts.
*   📊 **App Vitals & Reports:** Fetch acquisition data, crash rates, and ANR statistics instantly.
*   💬 **Review Management:** Read user reviews, filter by rating, and post replies automatically.
*   🖼️ **Store Presence:** Update store listings, translations, and manage screenshots/feature graphics.

## 🛠️ Provided Tools

This MCP server exposes 15 powerful tools to your AI agent:

### 📦 App & Listings
*   `gpc_get_app_info` - Get app details (package name, default language, contact info)
*   `gpc_list_listings` - Fetch all store listings across locales
*   `gpc_update_listing` - Update store listing for a specific locale

### 🚀 Release & Track Management
*   `gpc_list_tracks` - List tracks (internal, alpha, beta, production) with current releases
*   `gpc_create_release` - Create a new release on a specified track
*   `gpc_update_release_notes` - Update release notes for the latest release
*   `gpc_set_rollout` - Set/update staged rollout percentage
*   `gpc_halt_rollout` - Halt an ongoing staged rollout

### 💬 Reviews
*   `gpc_list_reviews` - Fetch user reviews with ratings and reply status
*   `gpc_reply_review` - Post a reply to a user review

### 📈 Reports & Vitals
*   `gpc_acquisition_report` - Fetch install/acquisition statistics
*   `gpc_crash_report` - Get Crash and ANR rates from Android Vitals

### 📸 Screenshots & Images
*   `gpc_list_images` - List uploaded images for a specific locale
*   `gpc_upload_image` - Upload screenshots/feature graphics/icons
*   `gpc_delete_image` - Delete a specific image

---

## ⚙️ Quick Start

### 1. Obtain a Service Account Key
1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Enable the **"Google Play Android Developer API"**.
3. Create a Service Account and download the **JSON key**.
4. In [Google Play Console](https://play.google.com/console) > Setup > API access:
   - Link your Google Cloud project.
   - Grant the service account **"Admin"** or **"Release manager"** permissions.

### 2. Installation

Clone this repository and build:
```bash
git clone https://github.com/YOUR_USERNAME/gpc-mcp-server.git
cd gpc-mcp-server
npm install
npm run build
```

### 3. Connect to Claude Code (or any MCP Client)

Use the `claude mcp add` command to inject this server into your Claude environment:

```bash
claude mcp add --scope user gpc-mcp \
  -e GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/path/to/your/service-account.json \
  -e GOOGLE_PLAY_PACKAGE_NAME=com.yourcompany.appname \
  -- node /path/to/gpc-mcp-server/dist/index.js
```

### Environment Variables Required
| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Absolute path to the Service Account JSON key | `/users/me/secrets/play-store.json` |
| `GOOGLE_PLAY_PACKAGE_NAME` | Your Android application package name | `com.example.myapp` |

---

## 🤖 Example AI Prompts

Once configured, you can just talk to your AI agent naturally:

**Checking App Health:**
> *"Are there any new crashes for our app today?"* -> Agent calls `gpc_crash_report`

**Release Workflow:**
> *"Create a new internal release and update the Turkish release notes to say 'Bug fixes'."* -> Agent calls `gpc_create_release` and `gpc_update_release_notes`

**Customer Support:**
> *"Find all 1-star reviews from this week and draft replies for me."* -> Agent calls `gpc_list_reviews` and `gpc_reply_review`

---

## 📝 Supported Locales
Includes standard Play Console locales: `en-US`, `tr-TR`, `de-DE`, `es-419`, `fr-FR`, `ru-RU`, `ar` and many more.

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
