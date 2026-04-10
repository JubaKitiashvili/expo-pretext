package expo.modules.pretext

import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.BreakIterator
import java.util.Locale

/**
 * Data class for a cached measurement entry.
 * Tracks the measured width and a hit counter for LRU eviction.
 */
private data class CacheEntry(
    val width: Double,
    var hits: Int = 0
)

class ExpoPretextModule : Module() {

    // ── Caches ──────────────────────────────────────────────────────────────

    /** Font/TextPaint cache keyed by "family_size_weight_style" */
    private val fontCache = mutableMapOf<String, TextPaint>()

    /**
     * Measurement cache: outer key = font key, inner key = segment text.
     * Each entry records the measured width and a hit counter.
     */
    private val measureCache = mutableMapOf<String, MutableMap<String, CacheEntry>>()

    /** Maximum number of segment entries per font in the measurement cache. */
    private var maxCacheSize: Int = 5000

    // ── Whitespace regexes (compiled once) ──────────────────────────────────

    private val collapseWhitespaceRegex = Regex("\\s+")
    private val lineEndingRegex = Regex("\\r\\n|\\r")

    // ── Module definition ───────────────────────────────────────────────────

    override fun definition() = ModuleDefinition {
        Name("ExpoPretext")

        // ── segmentAndMeasure ───────────────────────────────────────────
        Function("segmentAndMeasure") { text: String, font: Map<String, Any>, options: Map<String, Any>? ->
            segmentAndMeasureInternal(text, font, options)
        }

        // ── batchSegmentAndMeasure ──────────────────────────────────────
        Function("batchSegmentAndMeasure") { texts: List<String>, font: Map<String, Any>, options: Map<String, Any>? ->
            texts.map { text -> segmentAndMeasureInternal(text, font, options) }
        }

        // ── measureGraphemeWidths ───────────────────────────────────────
        Function("measureGraphemeWidths") { segment: String, font: Map<String, Any> ->
            measureGraphemeWidthsInternal(segment, font)
        }

        // ── remeasureMerged ─────────────────────────────────────────────
        Function("remeasureMerged") { segments: List<String>, font: Map<String, Any> ->
            remeasureMergedInternal(segments, font)
        }

        // ── segmentAndMeasureAsync ──────────────────────────────────────
        AsyncFunction("segmentAndMeasureAsync") { text: String, font: Map<String, Any>, options: Map<String, Any>? ->
            segmentAndMeasureInternal(text, font, options)
        }

        // ── clearNativeCache ────────────────────────────────────────────
        Function("clearNativeCache") {
            fontCache.clear()
            measureCache.clear()
        }

        // ── setNativeCacheSize ──────────────────────────────────────────
        Function("setNativeCacheSize") { size: Int ->
            maxCacheSize = size
        }

        // ── getFontMetrics ─────────────────────────────────────────────
        Function("getFontMetrics") { font: Map<String, Any> ->
            val paint = getOrCreatePaint(font)
            val metrics = paint.fontMetrics
            mapOf(
                "ascender" to -metrics.ascent.toDouble(),  // Android ascent is negative
                "descender" to metrics.descent.toDouble(),
                "xHeight" to (paint.textSize * 0.52).toDouble(),  // approximate x-height
                "capHeight" to (paint.textSize * 0.72).toDouble(),  // approximate cap-height
                "lineGap" to metrics.leading.toDouble(),
            )
        }
    }

    // ── Core implementation ─────────────────────────────────────────────────

    /**
     * Segment text using BreakIterator.getWordInstance, measure each segment,
     * and return segments / isWordLike / widths arrays.
     */
    private fun segmentAndMeasureInternal(
        text: String,
        fontMap: Map<String, Any>,
        optionsMap: Map<String, Any>?
    ): Map<String, Any> {
        val whiteSpace = (optionsMap?.get("whiteSpace") as? String) ?: "normal"
        val localeStr = optionsMap?.get("locale") as? String
        val locale = if (localeStr != null) Locale.forLanguageTag(localeStr) else Locale.getDefault()

        // Normalize whitespace
        val normalized = normalizeWhitespace(text, whiteSpace)

        // Resolve paint
        val paint = getOrCreatePaint(fontMap)
        val fontKey = fontKeyFrom(fontMap)

        // Word-level segmentation
        val rawSegments = wordSegment(normalized, locale)

        // Build output arrays
        val segments = mutableListOf<String>()
        val isWordLike = mutableListOf<Boolean>()
        val widths = mutableListOf<Double>()

        for (seg in rawSegments) {
            val wordLike = isWordLikeSegment(seg)

            if (!wordLike && whiteSpace == "pre-wrap") {
                // In pre-wrap mode, split non-word segments into individual characters
                for (ch in seg) {
                    val s = ch.toString()
                    segments.add(s)
                    isWordLike.add(false)
                    widths.add(cachedMeasure(s, paint, fontKey))
                }
            } else {
                segments.add(seg)
                isWordLike.add(wordLike)
                widths.add(cachedMeasure(seg, paint, fontKey))
            }
        }

        return mapOf(
            "segments" to segments,
            "isWordLike" to isWordLike,
            "widths" to widths
        )
    }

    /**
     * Measure individual grapheme widths within a segment
     * using BreakIterator.getCharacterInstance.
     */
    private fun measureGraphemeWidthsInternal(
        segment: String,
        fontMap: Map<String, Any>
    ): List<Double> {
        val paint = getOrCreatePaint(fontMap)
        val graphemes = graphemeSegment(segment)
        return graphemes.map { g ->
            paint.measureText(g).toDouble()
        }
    }

    /**
     * Re-measure a list of pre-split segments with the given font.
     * Returns a list of widths corresponding 1:1 with the input segments.
     */
    private fun remeasureMergedInternal(
        segments: List<String>,
        fontMap: Map<String, Any>
    ): List<Double> {
        val paint = getOrCreatePaint(fontMap)
        val fontKey = fontKeyFrom(fontMap)
        return segments.map { seg ->
            cachedMeasure(seg, paint, fontKey)
        }
    }

    // ── Segmentation helpers ────────────────────────────────────────────────

    /**
     * Segment text into word-level boundaries using ICU BreakIterator.
     */
    private fun wordSegment(text: String, locale: Locale): List<String> {
        if (text.isEmpty()) return emptyList()

        val bi = BreakIterator.getWordInstance(locale)
        bi.setText(text)

        val segments = mutableListOf<String>()
        var start = bi.first()
        var end = bi.next()

        while (end != BreakIterator.DONE) {
            segments.add(text.substring(start, end))
            start = end
            end = bi.next()
        }

        return segments
    }

    /**
     * Segment text into grapheme clusters using BreakIterator.getCharacterInstance.
     */
    private fun graphemeSegment(text: String): List<String> {
        if (text.isEmpty()) return emptyList()

        val bi = BreakIterator.getCharacterInstance()
        bi.setText(text)

        val graphemes = mutableListOf<String>()
        var start = bi.first()
        var end = bi.next()

        while (end != BreakIterator.DONE) {
            graphemes.add(text.substring(start, end))
            start = end
            end = bi.next()
        }

        return graphemes
    }

    /**
     * Determine if a segment is "word-like" — i.e., contains at least one
     * letter or digit character.
     */
    private fun isWordLikeSegment(segment: String): Boolean {
        return segment.any { Character.isLetterOrDigit(it) }
    }

    // ── Whitespace normalization ────────────────────────────────────────────

    /**
     * In "normal" mode: collapse runs of whitespace to a single space.
     * In "pre-wrap" mode: normalize line endings (\r\n and \r -> \n) only.
     */
    private fun normalizeWhitespace(text: String, mode: String): String {
        return when (mode) {
            "pre-wrap" -> lineEndingRegex.replace(text, "\n")
            else -> collapseWhitespaceRegex.replace(text, " ")
        }
    }

    // ── Font / Paint helpers ────────────────────────────────────────────────

    /**
     * Build a stable cache key from the font descriptor map.
     */
    private fun fontKeyFrom(fontMap: Map<String, Any>): String {
        val family = (fontMap["fontFamily"] as? String) ?: "sans-serif"
        val size = fontMap["fontSize"]?.let { toDouble(it) } ?: 14.0
        val weight = (fontMap["fontWeight"] as? String) ?: "400"
        val style = (fontMap["fontStyle"] as? String) ?: "normal"
        return "${family}_${size}_${weight}_${style}"
    }

    /**
     * Get or create a TextPaint for the given font descriptor.
     * Cached by fontKey to avoid repeated Typeface resolution and Paint creation.
     */
    private fun getOrCreatePaint(fontMap: Map<String, Any>): TextPaint {
        val key = fontKeyFrom(fontMap)
        return fontCache.getOrPut(key) {
            val family = (fontMap["fontFamily"] as? String) ?: "sans-serif"
            val size = fontMap["fontSize"]?.let { toDouble(it) }?.toFloat() ?: 14f
            val weight = (fontMap["fontWeight"] as? String) ?: "400"
            val style = (fontMap["fontStyle"] as? String) ?: "normal"

            val typefaceStyle = resolveTypefaceStyle(weight, style)
            val typeface = Typeface.create(family, typefaceStyle)

            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                this.typeface = typeface
                this.textSize = size
            }
        }
    }

    /**
     * Map fontWeight + fontStyle to a Typeface style int.
     * Android Typeface supports: NORMAL, BOLD, ITALIC, BOLD_ITALIC.
     */
    private fun resolveTypefaceStyle(weight: String, style: String): Int {
        val isBold = when (weight) {
            "bold", "700", "800", "900" -> true
            else -> {
                val numericWeight = weight.toIntOrNull() ?: 400
                numericWeight >= 700
            }
        }
        val isItalic = style == "italic"

        return when {
            isBold && isItalic -> Typeface.BOLD_ITALIC
            isBold -> Typeface.BOLD
            isItalic -> Typeface.ITALIC
            else -> Typeface.NORMAL
        }
    }

    // ── Measurement with LRU cache ──────────────────────────────────────────

    /**
     * Measure a segment with caching. Each font gets its own sub-map.
     * When a sub-map exceeds maxCacheSize, the entry with the lowest hit
     * count is evicted.
     */
    private fun cachedMeasure(segment: String, paint: TextPaint, fontKey: String): Double {
        val fontMap = measureCache.getOrPut(fontKey) { mutableMapOf() }
        val existing = fontMap[segment]

        if (existing != null) {
            existing.hits++
            return existing.width
        }

        // Measure fresh
        val width = paint.measureText(segment).toDouble()
        fontMap[segment] = CacheEntry(width = width, hits = 1)

        // LRU eviction: if over capacity, remove the least-hit entry
        if (fontMap.size > maxCacheSize) {
            evictLeastUsed(fontMap)
        }

        return width
    }

    /**
     * Evict the entry with the lowest hit count from the given cache map.
     */
    private fun evictLeastUsed(cache: MutableMap<String, CacheEntry>) {
        var minKey: String? = null
        var minHits = Int.MAX_VALUE

        for ((key, entry) in cache) {
            if (entry.hits < minHits) {
                minHits = entry.hits
                minKey = key
            }
        }

        if (minKey != null) {
            cache.remove(minKey)
        }
    }

    // ── Utility ─────────────────────────────────────────────────────────────

    /**
     * Safely convert Any to Double, handling Int/Long/Float/Double/String.
     */
    private fun toDouble(value: Any): Double {
        return when (value) {
            is Double -> value
            is Float -> value.toDouble()
            is Int -> value.toDouble()
            is Long -> value.toDouble()
            is String -> value.toDoubleOrNull() ?: 14.0
            else -> 14.0
        }
    }
}
