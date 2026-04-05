import ExpoModulesCore
import UIKit

// MARK: - Cache Entry

private struct CacheEntry {
  let width: Double
  var hits: Int
}

// MARK: - ExpoPretext Module

public class ExpoPretext: Module {

  // Font cache: "family_size_weight_style" -> UIFont
  private var fontCache: [String: UIFont] = [:]

  // Measure cache: fontKey -> (segmentText -> CacheEntry)
  private var measureCache: [String: [String: CacheEntry]] = [:]

  // Max segments per font before LRU eviction
  private var maxCacheSize: Int = 5000

  // MARK: - Module Definition

  public func definition() -> ModuleDefinition {
    Name("ExpoPretext")

    // Trim caches on memory warning
    OnAppEntersBackground {
      self.trimCaches(keepTop: 1000)
    }

    // Register for memory warning notifications
    OnStartObserving {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleMemoryWarning),
        name: UIApplication.didReceiveMemoryWarningNotification,
        object: nil
      )
    }

    OnStopObserving {
      NotificationCenter.default.removeObserver(
        self,
        name: UIApplication.didReceiveMemoryWarningNotification,
        object: nil
      )
    }

    // segmentAndMeasure(text, font, options?) -> { segments, isWordLike, widths }
    Function("segmentAndMeasure") { (text: String, fontDesc: [String: Any], options: [String: Any]?) -> [String: Any] in
      let font = self.resolveFont(fontDesc)
      let fontKey = self.fontKey(fontDesc)
      let whiteSpace = (options?["whiteSpace"] as? String) ?? "normal"
      let locale = options?["locale"] as? String
      return self.performSegmentAndMeasure(text: text, font: font, fontKey: fontKey, whiteSpace: whiteSpace, locale: locale)
    }

    // batchSegmentAndMeasure(texts, font, options?) -> [{ segments, isWordLike, widths }]
    Function("batchSegmentAndMeasure") { (texts: [String], fontDesc: [String: Any], options: [String: Any]?) -> [[String: Any]] in
      let font = self.resolveFont(fontDesc)
      let fontKey = self.fontKey(fontDesc)
      let whiteSpace = (options?["whiteSpace"] as? String) ?? "normal"
      let locale = options?["locale"] as? String
      return texts.map { text in
        self.performSegmentAndMeasure(text: text, font: font, fontKey: fontKey, whiteSpace: whiteSpace, locale: locale)
      }
    }

    // measureGraphemeWidths(segment, font) -> [Double]
    Function("measureGraphemeWidths") { (segment: String, fontDesc: [String: Any]) -> [Double] in
      let font = self.resolveFont(fontDesc)
      var widths: [Double] = []
      var index = segment.startIndex
      while index < segment.endIndex {
        let nextIndex = segment.index(after: index)
        // Walk to next grapheme cluster boundary
        let grapheme = String(segment[index..<nextIndex])
        let size = (grapheme as NSString).size(withAttributes: [.font: font])
        widths.append(Double(size.width))
        index = nextIndex
      }
      return widths
    }

    // remeasureMerged(segments, font) -> [Double]
    Function("remeasureMerged") { (segments: [String], fontDesc: [String: Any]) -> [Double] in
      let font = self.resolveFont(fontDesc)
      return segments.map { segment in
        let size = (segment as NSString).size(withAttributes: [.font: font])
        return Double(size.width)
      }
    }

    // segmentAndMeasureAsync(text, font, options?) -> Promise<{ segments, isWordLike, widths }>
    AsyncFunction("segmentAndMeasureAsync") { (text: String, fontDesc: [String: Any], options: [String: Any]?, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let font = self.resolveFont(fontDesc)
        let fontKey = self.fontKey(fontDesc)
        let whiteSpace = (options?["whiteSpace"] as? String) ?? "normal"
        let locale = options?["locale"] as? String
        let result = self.performSegmentAndMeasure(text: text, font: font, fontKey: fontKey, whiteSpace: whiteSpace, locale: locale)
        promise.resolve(result)
      }
    }

    // clearNativeCache() -> void
    Function("clearNativeCache") {
      self.fontCache.removeAll()
      self.measureCache.removeAll()
    }

    // setNativeCacheSize(size) -> void
    Function("setNativeCacheSize") { (size: Int) in
      self.maxCacheSize = max(size, 100) // floor at 100 to avoid thrashing
    }
  }

  // MARK: - Memory Warning

  @objc private func handleMemoryWarning() {
    trimCaches(keepTop: 200)
  }

  // MARK: - Cache Trimming

  /// Trim each font's measure cache to the top N entries by hit count.
  private func trimCaches(keepTop n: Int) {
    for fontKey in measureCache.keys {
      guard let entries = measureCache[fontKey], entries.count > n else { continue }
      // Sort by hits descending, keep top n
      let sorted = entries.sorted { $0.value.hits > $1.value.hits }
      var trimmed: [String: CacheEntry] = [:]
      trimmed.reserveCapacity(n)
      for (i, pair) in sorted.enumerated() {
        if i >= n { break }
        trimmed[pair.key] = pair.value
      }
      measureCache[fontKey] = trimmed
    }
  }

  // MARK: - Font Resolution

  /// Build a cache key from a font descriptor dictionary.
  private func fontKey(_ desc: [String: Any]) -> String {
    let family = (desc["fontFamily"] as? String) ?? "System"
    let size = desc["fontSize"] as? Double ?? 14.0
    let weight = (desc["fontWeight"] as? String) ?? "400"
    let style = (desc["fontStyle"] as? String) ?? "normal"
    return "\(family)_\(size)_\(weight)_\(style)"
  }

  /// Resolve a font descriptor to a UIFont, using the font cache.
  private func resolveFont(_ desc: [String: Any]) -> UIFont {
    let key = fontKey(desc)
    if let cached = fontCache[key] {
      return cached
    }

    let family = (desc["fontFamily"] as? String) ?? "System"
    let size = CGFloat(desc["fontSize"] as? Double ?? 14.0)
    let weightStr = (desc["fontWeight"] as? String) ?? "400"
    let style = (desc["fontStyle"] as? String) ?? "normal"

    let uiWeight = mapFontWeight(weightStr)
    var font: UIFont

    if family == "System" || family == "system" {
      font = UIFont.systemFont(ofSize: size, weight: uiWeight)
    } else {
      // Try to create the font by family name
      if let descriptorFont = UIFont(name: family, size: size) {
        font = descriptorFont
      } else {
        // Fallback: use system font with the requested weight
        font = UIFont.systemFont(ofSize: size, weight: uiWeight)
      }
    }

    // Apply bold weight via descriptor if needed
    if uiWeight == .bold || uiWeight == .semibold || uiWeight == .heavy || uiWeight == .black {
      if let descriptor = font.fontDescriptor.withSymbolicTraits(.traitBold) {
        font = UIFont(descriptor: descriptor, size: size)
      }
    }

    // Apply italic via symbolic trait
    if style == "italic" {
      if let descriptor = font.fontDescriptor.withSymbolicTraits(.traitItalic) {
        font = UIFont(descriptor: descriptor, size: size)
      }
    }

    fontCache[key] = font
    return font
  }

  /// Map CSS-style font weight string to UIFont.Weight.
  private func mapFontWeight(_ weight: String) -> UIFont.Weight {
    switch weight {
    case "100": return .ultraLight
    case "200": return .thin
    case "300": return .light
    case "400", "normal": return .regular
    case "500": return .medium
    case "600": return .semibold
    case "700", "bold": return .bold
    case "800": return .heavy
    case "900": return .black
    default: return .regular
    }
  }

  // MARK: - Segmentation & Measurement

  /// Core implementation: segment text and measure each segment's width.
  private func performSegmentAndMeasure(
    text: String,
    font: UIFont,
    fontKey: String,
    whiteSpace: String,
    locale: String?
  ) -> [String: Any] {
    if text.isEmpty {
      return [
        "segments": [String](),
        "isWordLike": [Bool](),
        "widths": [Double]()
      ]
    }

    let rawSegments = segmentText(text, whiteSpace: whiteSpace, locale: locale)

    var segments: [String] = []
    var isWordLike: [Bool] = []
    var widths: [Double] = []

    segments.reserveCapacity(rawSegments.count)
    isWordLike.reserveCapacity(rawSegments.count)
    widths.reserveCapacity(rawSegments.count)

    // Ensure font key has a cache bucket
    if measureCache[fontKey] == nil {
      measureCache[fontKey] = [:]
    }

    for segment in rawSegments {
      segments.append(segment)
      isWordLike.append(classifyWordLike(segment))

      // Check measurement cache
      if var entry = measureCache[fontKey]?[segment] {
        entry.hits += 1
        measureCache[fontKey]?[segment] = entry
        widths.append(entry.width)
      } else {
        // Measure the segment
        let size = (segment as NSString).size(withAttributes: [.font: font])
        let width = Double(size.width)
        measureCache[fontKey]?[segment] = CacheEntry(width: width, hits: 1)
        widths.append(width)

        // Check if we need LRU eviction
        if let count = measureCache[fontKey]?.count, count > maxCacheSize {
          evictLRU(fontKey: fontKey)
        }
      }
    }

    return [
      "segments": segments,
      "isWordLike": isWordLike,
      "widths": widths
    ]
  }

  /// Segment text using CFStringTokenizer.
  /// In pre-wrap mode, whitespace characters are split into individual segments.
  /// In normal mode, whitespace runs are collapsed into a single space.
  private func segmentText(_ text: String, whiteSpace: String, locale: String?) -> [String] {
    let cfText = text as CFString
    let fullRange = CFRangeMake(0, CFStringGetLength(cfText))

    // Set up locale for tokenizer
    let cfLocale: CFLocale?
    if let locale = locale {
      let loc = Locale(identifier: locale)
      cfLocale = loc as CFLocale
    } else {
      cfLocale = CFLocaleCopyCurrent()
    }

    let tokenizer = CFStringTokenizerCreate(
      nil,
      cfText,
      fullRange,
      kCFStringTokenizerUnitWordBoundary,
      cfLocale
    )

    var segments: [String] = []
    let nsText = text as NSString
    var currentPos: CFIndex = 0
    let length = CFStringGetLength(cfText)

    // Walk through all tokens
    var tokenType = CFStringTokenizerAdvanceToNextToken(tokenizer)

    while currentPos < length {
      if tokenType != CFStringTokenizerTokenType(rawValue: 0) {
        let tokenRange = CFStringTokenizerGetCurrentTokenRange(tokenizer)

        // Handle any gap before this token (whitespace between tokens)
        if tokenRange.location > currentPos {
          let gapRange = NSRange(location: currentPos, length: tokenRange.location - currentPos)
          let gap = nsText.substring(with: gapRange)
          let whitespaceSegments = processWhitespace(gap, mode: whiteSpace)
          segments.append(contentsOf: whitespaceSegments)
        }

        // Add the token itself
        let tokenNSRange = NSRange(location: tokenRange.location, length: tokenRange.length)
        let token = nsText.substring(with: tokenNSRange)
        segments.append(token)

        currentPos = tokenRange.location + tokenRange.length
        tokenType = CFStringTokenizerAdvanceToNextToken(tokenizer)
      } else {
        // No more tokens; process remaining text as whitespace/trailing content
        let remainingRange = NSRange(location: currentPos, length: length - currentPos)
        let remaining = nsText.substring(with: remainingRange)
        let whitespaceSegments = processWhitespace(remaining, mode: whiteSpace)
        segments.append(contentsOf: whitespaceSegments)
        currentPos = length
      }
    }

    return segments
  }

  /// Process a whitespace (or non-token gap) string based on white-space mode.
  /// - normal: collapse runs of whitespace to a single space " ".
  /// - pre-wrap: split each whitespace character into its own segment.
  private func processWhitespace(_ gap: String, mode: String) -> [String] {
    if gap.isEmpty { return [] }

    if mode == "pre-wrap" {
      // Each character becomes its own segment
      return gap.map { String($0) }
    } else {
      // Normal mode: collapse any whitespace run to a single space
      // But if the gap contains no whitespace, return it as-is
      let trimmed = gap.replacingOccurrences(
        of: "\\s+",
        with: " ",
        options: .regularExpression
      )
      if trimmed.isEmpty { return [] }
      return [trimmed]
    }
  }

  /// Classify whether a segment is "word-like" (contains at least one alphanumeric/letter character).
  private func classifyWordLike(_ segment: String) -> Bool {
    for scalar in segment.unicodeScalars {
      if CharacterSet.alphanumerics.contains(scalar) {
        return true
      }
    }
    return false
  }

  // MARK: - LRU Eviction

  /// Evict the least-hit entries from a font's measure cache, keeping the top maxCacheSize * 0.8 entries.
  private func evictLRU(fontKey: String) {
    guard let entries = measureCache[fontKey] else { return }
    let keepCount = Int(Double(maxCacheSize) * 0.8)
    let sorted = entries.sorted { $0.value.hits > $1.value.hits }
    var trimmed: [String: CacheEntry] = [:]
    trimmed.reserveCapacity(keepCount)
    for (i, pair) in sorted.enumerated() {
      if i >= keepCount { break }
      trimmed[pair.key] = pair.value
    }
    measureCache[fontKey] = trimmed
  }
}
