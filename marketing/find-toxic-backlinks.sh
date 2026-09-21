#!/bin/bash
# find-toxic-backlinks.sh — Discover toxic backlinks pointing to walletlens.live
#
# This script searches multiple free sources for referring domains.
# It flags common PBN/spam patterns and outputs them as disavow-ready entries.
#
# Usage:
#   chmod +x marketing/find-toxic-backlinks.sh
#   ./marketing/find-toxic-backlinks.sh > marketing/toxic-discovered.txt
#
# Manual steps required after:
#   1. Review marketing/toxic-discovered.txt for false positives
#   2. Paste confirmed entries into marketing/disavow.txt
#   3. Upload disavow.txt to Google Search Console
#
# Required: curl, grep, sort, uniq

DOMAIN="walletlens.live"
OUTPUT="marketing/toxic-discovered.txt"

echo "# Toxic backlinks discovered for $DOMAIN" > "$OUTPUT"
echo "# Generated: $(date -u '+%Y-%m-%d %H:%M UTC')" >> "$OUTPUT"
echo "# Review each entry before adding to disavow.txt" >> "$OUTPUT"
echo "#" >> "$OUTPUT"

declare -a FOUND_DOMAINS=()

echo "[1/4] Searching Common Crawl index..."
# Common Crawl's free index — find pages that mention walletlens.live
curl -s "https://index.commoncrawl.org/CC-MAIN-2026-30-index?url=*$DOMAIN*&output=json" --max-time 30 2>/dev/null \
  | grep -oP '"url":"[^"]*"' | sed 's/"url":"//;s/"//' | sed 's|https*://||;s|/.*||' | sort -u >> "$OUTPUT"

echo "[2/4] Checking OpenLinkProfiler (free)..."
curl -s "https://openlinkprofiler.org/r/$DOMAIN" --max-time 20 2>/dev/null \
  | grep -oP 'href="/r/[^"]*"' | sed 's|href="/r/||;s|/||' | sort -u >> "$OUTPUT"

echo "[3/4] Searching Wayback Machine external links..."
# Find external pages in the Wayback Machine that contain $DOMAIN
curl -s "https://web.archive.org/cdx/search/cdx?url=$DOMAIN/*&output=json&fl=original&collapse=urlkey&limit=200" --max-time 30 2>/dev/null \
  | grep -oP '"url":"[^"]*"' | sed 's/"url":"//;s/"//' | sed 's|https*://||;s|/.*||' | sort -u >> "$OUTPUT"

echo "[4/4] Checking Google cache for referring domains..."
curl -s "https://www.google.com/search?q=%22$DOMAIN%22" --max-time 15 \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 2>/dev/null \
  | grep -oP 'https?://[a-z0-9.-]+' | grep -vE 'google|gstatic|googleapis|schema\.org|w3\.org' \
  | sed 's|https*://||;s|/.*||' | sort -u >> "$OUTPUT"

echo ""
echo "Discovered domains:"
echo "  Total lines in $OUTPUT: $(wc -l < "$OUTPUT")"
echo ""
echo "Common PBN/spam patterns found:"
grep -iE '\.(store|xyz|top|click|link|space)$' "$OUTPUT" | sort -u
echo ""
echo "Domains with suspicious keywords:"
grep -iE 'pbn|seo|backlink|rank.*boost|buy.*link|link.*farm|casino|gambl' "$OUTPUT" | sort -u
echo ""
echo "Next steps:"
echo "  1. Review $OUTPUT above"
echo "  2. For each confirmed toxic domain, add to marketing/disavow.txt"
echo "  3. Upload marketing/disavow.txt to:"
echo "     https://search.google.com/search-console/disavow-links"
echo ""
echo "For the FULL list of 221+ toxic domains:"
echo "  1. Go to https://search.google.com/search-console"
echo "  2. Select walletlens.live → Links → External links → Top linking sites"
echo "  3. Click Export → Download CSV"
echo "  4. For each domain in the CSV:"
echo "     - Search for it in the CSV"
echo "     - If it matches toxic patterns above, add to disavow.txt"
