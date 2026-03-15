# Google Play Console MCP Server

MCP (Model Context Protocol) server for managing Google Play Console from Claude Code.

## Tools (15)

### App & Listings
- **gpc_get_app_info** - App details (package name, default language, contact info)
- **gpc_list_listings** - All store listings across locales
- **gpc_update_listing** - Update listing for a specific locale

### Release & Track Management
- **gpc_list_tracks** - List tracks (internal, alpha, beta, production) with releases
- **gpc_create_release** - Create a new release on a track
- **gpc_update_release_notes** - Update release notes for latest release
- **gpc_set_rollout** - Set/update staged rollout percentage
- **gpc_halt_rollout** - Halt an ongoing rollout

### Reviews
- **gpc_list_reviews** - User reviews with ratings and reply status
- **gpc_reply_review** - Reply to a user review

### Reports & Vitals
- **gpc_acquisition_report** - Install/acquisition statistics
- **gpc_crash_report** - Crash and ANR rates from Android vitals

### Screenshots & Images
- **gpc_list_images** - List uploaded images for a locale
- **gpc_upload_image** - Upload screenshot/feature graphic/icon
- **gpc_delete_image** - Delete a single image

## Setup

### 1. Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable "Google Play Android Developer API"
3. Create a Service Account with JSON key
4. In [Google Play Console](https://play.google.com/console) > Setup > API access:
   - Link the Google Cloud project
   - Grant the service account "Admin" or "Release manager" permissions

### 2. Install

```bash
cd tools/gpc-mcp-server
npm install
npm run build
```

### 3. Configure Claude Code

```bash
claude mcp add --scope user gpc-mcp \
  -e GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/home/mali/ssh_backup_goygoychat/play-store-service-account.json \
  -e GOOGLE_PLAY_PACKAGE_NAME=com.fixmob.vipchat \
  -- node /home/mali/Development/falla-clone/tools/gpc-mcp-server/dist/index.js
```

### 4. Test

```bash
npm test
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Path to service account JSON key file | `/path/to/service-account.json` |
| `GOOGLE_PLAY_PACKAGE_NAME` | Android package name | `com.fixmob.vipchat` |

## Supported Locales

| Code | Language |
|------|----------|
| en-US | English (US) |
| tr-TR | Turkish |
| de-DE | German |
| es-419 | Spanish (Latin America) |
| fr-FR | French |
| ru-RU | Russian |
| ar | Arabic |

## Common Workflows

### New Release
```
gpc_list_tracks -> gpc_create_release -> gpc_set_rollout
```

### Update Store Listing
```
gpc_list_listings -> gpc_update_listing (per locale)
```

### Monitor Reviews
```
gpc_list_reviews -> gpc_reply_review (for low ratings)
```

### Check App Health
```
gpc_crash_report -> gpc_acquisition_report
```
