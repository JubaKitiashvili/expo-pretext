package expo.modules.pretext

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import com.facebook.react.common.assets.ReactFontManager
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

private data class InkBoundsValue(
    val left: Double,
    val top: Double,
    val right: Double,
    val bottom: Double,
    val width: Double,
    val height: Double,
) {
    fun toMap(): Map<String, Double> {
        return mapOf(
            "left" to left,
            "top" to top,
            "right" to right,
            "bottom" to bottom,
            "width" to width,
            "height" to height,
        )
    }
}

private data class InkBoundsCacheEntry(
    val bounds: InkBoundsValue,
    var hits: Int = 0,
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

    /** Ink-bounds measurement cache (separate from advance-width cache). */
    private val inkMeasureCache = mutableMapOf<String, MutableMap<String, InkBoundsCacheEntry>>()

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
            inkMeasureCache.clear()
        }

        // ── setNativeCacheSize ──────────────────────────────────────────
        Function("setNativeCacheSize") { size: Int ->
            maxCacheSize = size
        }

        // ── measureInkWidth ────────────────────────────────────────────
        // Uses Paint.getTextBounds for ink bounds (tight glyph bounding
        // rect) instead of Paint.measureText (advance width).
        // Fixes RN #56349-class italic/bold-italic container clipping.
        Function("measureInkWidth") { text: String, font: Map<String, Any> ->
            if (text.isEmpty()) 0.0
            else {
                val paint = getOrCreatePaint(font)
                val fontKey = fontKeyFrom(font)
                cachedInkMeasure(text, paint, fontKey).width
            }
        }

        Function("measureInkBounds") { text: String, font: Map<String, Any> ->
            if (text.isEmpty()) {
                mapOf(
                    "left" to 0.0,
                    "top" to 0.0,
                    "right" to 0.0,
                    "bottom" to 0.0,
                    "width" to 0.0,
                    "height" to 0.0,
                )
            } else {
                val paint = getOrCreatePaint(font)
                val fontKey = fontKeyFrom(font)
                cachedInkMeasure(text, paint, fontKey).toMap()
            }
        }

        // ── measureInkSafe ────────────────────────────────────────────
        // Single-call API returning ink bounds + advance + font metrics.
        // Used by getInkSafePadding() to compute italic-safe padding
        // with one bridge crossing instead of three.
        Function("measureInkSafe") { text: String, font: Map<String, Any> ->
            if (text.isEmpty()) {
                return@Function mapOf(
                    "left" to 0.0, "top" to 0.0,
                    "right" to 0.0, "bottom" to 0.0,
                    "width" to 0.0, "height" to 0.0,
                    "advance" to 0.0,
                    "ascender" to 0.0, "descender" to 0.0,
                )
            }
            val paint = getOrCreatePaint(font)
            val fontKey = fontKeyFrom(font)
            val bounds = cachedInkMeasure(text, paint, fontKey)
            val advance = paint.measureText(text).toDouble()
            val metrics = paint.fontMetrics
            mapOf(
                "left" to bounds.left, "top" to bounds.top,
                "right" to bounds.right, "bottom" to bounds.bottom,
                "width" to bounds.width, "height" to bounds.height,
                "advance" to advance,
                "ascender" to -metrics.ascent.toDouble(),
                // Android's `descent` is positive below the baseline; iOS's
                // `font.descender` and the JS/web fallbacks are negative.
                // Negate so every platform reports the same sign convention.
                "descender" to -metrics.descent.toDouble(),
            )
        }

        // ── getFontMetrics ─────────────────────────────────────────────
        Function("getFontMetrics") { font: Map<String, Any> ->
            val paint = getOrCreatePaint(font)
            val metrics = paint.fontMetrics
            mapOf(
                "ascender" to -metrics.ascent.toDouble(),  // Android ascent is negative
                // Android's `descent` is positive below the baseline; iOS's
                // `font.descender` and the JS/web fallbacks are negative.
                // Negate so every platform reports the same sign convention.
                "descender" to -metrics.descent.toDouble(),
                "xHeight" to glyphInkHeight(paint, "x", 0.52f),
                "capHeight" to glyphInkHeight(paint, "H", 0.72f),
                "lineGap" to metrics.leading.toDouble(),
            )
        }
    }

    /**
     * Ink height of a single reference glyph, in pixels.
     *
     * Android's Paint exposes no x-height / cap-height metric (unlike iOS's
     * UIFont.xHeight / capHeight, which read the OS/2 table), so we measure the
     * outline of a reference glyph instead: "x" for x-height, "H" for
     * cap-height. Paint.getTextPath gives sub-pixel bounds, unlike
     * Paint.getTextBounds which rounds to whole pixels.
     *
     * Falls back to `textSize * ratio` when the font has no outline for the
     * glyph (bitmap/colour fonts, or a missing glyph).
     */
    private fun glyphInkHeight(paint: TextPaint, glyph: String, fallbackRatio: Float): Double {
        return try {
            val path = Path()
            paint.getTextPath(glyph, 0, glyph.length, 0f, 0f, path)
            val bounds = RectF()
            @Suppress("DEPRECATION")
            path.computeBounds(bounds, true)
            val height = bounds.height()
            if (height > 0f) height.toDouble() else (paint.textSize * fallbackRatio).toDouble()
        } catch (e: Exception) {
            (paint.textSize * fallbackRatio).toDouble()
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
            val typeface = resolveTypeface(family, weight, style, typefaceStyle)

            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                this.typeface = typeface
                this.textSize = size
            }
        }
    }

    private fun resolveTypeface(
        family: String,
        weight: String,
        style: String,
        fallbackStyle: Int,
    ): Typeface {
        val assetManager = appContext.reactContext?.assets
        if (assetManager != null) {
            val numericWeight = when (weight) {
                "normal" -> 400
                "bold" -> 700
                else -> weight.toIntOrNull() ?: 400
            }
            val italic = style == "italic"
            return ReactFontManager.getInstance().getTypeface(family, numericWeight, italic, assetManager)
        }

        return Typeface.create(family, fallbackStyle)
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
            evictLeastUsed(fontMap) { it.hits }
        }

        return width
    }

    /**
     * Evict the entry with the lowest hit count from the given cache map.
     */
    private fun <T> evictLeastUsed(cache: MutableMap<String, T>, hitsOf: (T) -> Int) {
        var minKey: String? = null
        var minHits = Int.MAX_VALUE

        for ((key, entry) in cache) {
            val hits = hitsOf(entry)
            if (hits < minHits) {
                minHits = hits
                minKey = key
            }
        }

        if (minKey != null) {
            cache.remove(minKey)
        }
    }

    // ── Ink-bounds measurement with LRU cache ────────────────────────────────

    private fun cachedInkMeasure(segment: String, paint: TextPaint, fontKey: String): InkBoundsValue {
        val fontMap = inkMeasureCache.getOrPut(fontKey) { mutableMapOf() }
        val existing = fontMap[segment]

        if (existing != null) {
            existing.hits++
            return existing.bounds
        }

        val measured = measureInkBoundsValue(segment, paint)

        fontMap[segment] = InkBoundsCacheEntry(bounds = measured, hits = 1)

        if (fontMap.size > maxCacheSize) {
            evictLeastUsed(fontMap) { it.hits }
        }

        return measured
    }

    private fun measureInkBoundsValue(segment: String, paint: TextPaint): InkBoundsValue {
        val metrics = paint.fontMetrics
        val advance = paint.measureText(segment).toDouble()
        val ascent = kotlin.math.abs(metrics.ascent.toDouble())
        val descent = kotlin.math.abs(metrics.descent.toDouble())
        val leading = kotlin.math.abs(metrics.leading.toDouble())
        val padding = maxOf(8.0, kotlin.math.ceil(paint.textSize.toDouble()))
        val canvasWidth = maxOf(1, kotlin.math.ceil(advance + padding * 2.0 + paint.textSize.toDouble()).toInt())
        val canvasHeight = maxOf(1, kotlin.math.ceil(ascent + descent + leading + padding * 2.0 + 2.0).toInt())

        val bitmap = Bitmap.createBitmap(canvasWidth, canvasHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.TRANSPARENT)

        val originX = padding.toFloat()
        val originY = (padding + ascent + 1.0).toFloat()
        canvas.drawText(segment, originX, originY, paint)

        scanRasterInkBounds(bitmap, originX.toDouble(), originY.toDouble())?.let {
            bitmap.recycle()
            return it
        }

        bitmap.recycle()

        val top = kotlin.math.floor(metrics.ascent.toDouble())
        val bottom = kotlin.math.ceil(metrics.descent.toDouble())
        val ceiledAdvance = kotlin.math.ceil(advance)
        return InkBoundsValue(
            left = 0.0,
            top = top,
            right = ceiledAdvance,
            bottom = bottom,
            width = ceiledAdvance,
            height = bottom - top,
        )
    }

    private fun scanRasterInkBounds(
        bitmap: Bitmap,
        originX: Double,
        originY: Double,
    ): InkBoundsValue? {
        val width = bitmap.width
        val height = bitmap.height
        var minX = width
        var maxX = -1
        var minY = height
        var maxY = -1

        for (y in 0 until height) {
            for (x in 0 until width) {
                val alpha = bitmap.getPixel(x, y) ushr 24
                if (alpha > 0) {
                    if (x < minX) minX = x
                    if (x > maxX) maxX = x
                    if (y < minY) minY = y
                    if (y > maxY) maxY = y
                }
            }
        }

        if (maxX < 0 || maxY < 0 || minX >= width || minY >= height) {
            return null
        }

        val left = kotlin.math.floor(minX.toDouble() - originX)
        val right = kotlin.math.ceil(maxX.toDouble() + 1.0 - originX)
        val top = kotlin.math.floor(minY.toDouble() - originY)
        val bottom = kotlin.math.ceil(maxY.toDouble() + 1.0 - originY)
        return InkBoundsValue(
            left = left,
            top = top,
            right = right,
            bottom = bottom,
            width = right - left,
            height = bottom - top,
        )
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
