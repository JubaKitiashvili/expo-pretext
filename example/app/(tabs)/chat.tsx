import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { mockMessages, mockStreamTokens, type ChatMessage } from '../../data/mock-messages'
import { MarkdownRenderer } from '../../components/MarkdownRenderer'
import { markdownSample } from '../../data/sample-texts'
import { useTextHeight, useStreamingLayout } from 'expo-pretext'

const textStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

function ChatBubble({ message, maxWidth }: { message: ChatMessage; maxWidth: number }) {
  const isUser = message.role === 'user'

  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.assistantBubble,
      ]}
    >
      <MarkdownRenderer content={message.content} variant={isUser ? 'dark' : 'light'} />
      {message.reactions && (
        <Text style={styles.reactions}>{message.reactions.join(' ')}</Text>
      )}
    </View>
  )
}

function StreamingBubble({ text, maxWidth }: { text: string; maxWidth: number }) {
  // Streaming: useTextHeight auto-detects append pattern, uses incremental extend
  const height = useTextHeight(text, textStyle, maxWidth)
  const streaming = useStreamingLayout(text, textStyle, maxWidth)

  return (
    <View>
      <View style={[styles.bubble, styles.assistantBubble, styles.streamingBubble, { minHeight: height + 24 }]}>
        <MarkdownRenderer content={text} variant="light" />
        <View style={styles.cursor} />
      </View>
      <Text style={styles.streamingInfo}>
        {streaming.lineCount} lines · last line {Math.round(streaming.lastLineWidth)}px
      </Text>
    </View>
  )
}

export default function ChatScreen() {
  const { width } = useWindowDimensions()
  const bubbleMaxWidth = width * 0.75
  const [messages] = useState<ChatMessage[]>(mockMessages)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const startStreaming = useCallback(async () => {
    if (isStreaming) return
    setIsStreaming(true)
    const stream = mockStreamTokens(markdownSample)
    for await (const text of stream) {
      setStreamingText(text)
    }
    setStreamingText('')
    setIsStreaming(false)
  }, [isStreaming])

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubble message={item} maxWidth={bubbleMaxWidth} />
    ),
    [bubbleMaxWidth]
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {messages.length} messages | FlashList v2
        </Text>
      </View>

      <FlashList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={msg => msg.id}
      />

      {streamingText !== '' && (
        <StreamingBubble text={streamingText} maxWidth={bubbleMaxWidth} />
      )}

      <Pressable style={styles.streamBtn} onPress={startStreaming} disabled={isStreaming}>
        <Text style={styles.streamBtnText}>
          {isStreaming ? 'Streaming...' : 'Simulate AI Response'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#e8e8e8',
  },
  headerText: { fontSize: 12, color: '#666', textAlign: 'center' },
  bubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '80%',
    marginBottom: 8,
    marginHorizontal: 16,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  streamingBubble: {
    position: 'absolute',
    bottom: 80,
    left: 0,
  },
  reactions: { fontSize: 14, marginTop: 4 },
  cursor: {
    width: 2,
    height: 16,
    backgroundColor: '#007AFF',
    marginTop: 4,
  },
  streamBtn: {
    margin: 16,
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  streamBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  streamingInfo: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    fontFamily: 'Menlo',
    marginTop: 4,
  },
})
