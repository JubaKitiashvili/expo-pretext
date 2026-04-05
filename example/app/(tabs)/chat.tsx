import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, TextInput, Pressable } from 'react-native'

import { chatTheme } from '../../data/chat-theme'
import { mockMessages, mockStreamTokens, type ChatMessage } from '../../data/mock-messages'
import { markdownSample } from '../../data/sample-texts'

// TODO: Replace with expo-pretext imports once dev build is ready
// import { useTextHeight, useFlashListHeights } from 'expo-pretext'

export default function ChatScreen() {
  const { width } = useWindowDimensions()
  const bubbleWidth = width - chatTheme.screenPadding * 2 - chatTheme.avatarSize - chatTheme.avatarGap
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages.slice(0, 20))
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [mode, setMode] = useState<'pretext' | 'onlayout'>('pretext')

  const startStreaming = useCallback(async () => {
    if (isStreaming) return
    setIsStreaming(true)
    const stream = mockStreamTokens(markdownSample)
    for await (const text of stream) {
      setStreamingText(text)
    }
    setMessages(prev => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'assistant',
        content: markdownSample,
        timestamp: Date.now(),
        status: 'complete',
      },
    ])
    setStreamingText('')
    setIsStreaming(false)
  }, [isStreaming])

  return (
    <View style={styles.container}>
      {/* Mode toggle */}
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleBtn, mode === 'pretext' && styles.toggleActive]}
          onPress={() => setMode('pretext')}
        >
          <Text style={[styles.toggleText, mode === 'pretext' && styles.toggleTextActive]}>
            expo-pretext
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, mode === 'onlayout' && styles.toggleActive]}
          onPress={() => setMode('onlayout')}
        >
          <Text style={[styles.toggleText, mode === 'onlayout' && styles.toggleTextActive]}>
            onLayout
          </Text>
        </Pressable>
      </View>

      {/* Messages */}
      <ScrollView style={styles.messageList} contentContainerStyle={styles.messageContent}>
        {messages.slice(-10).map(msg => (
          <View
            key={msg.id}
            style={[
              styles.bubble,
              msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <Text style={styles.messageText}>{msg.content}</Text>
            {msg.reactions && (
              <Text style={styles.reactions}>{msg.reactions.join(' ')}</Text>
            )}
          </View>
        ))}
        {streamingText !== '' && (
          <View style={[styles.bubble, styles.assistantBubble]}>
            <Text style={styles.messageText}>{streamingText}</Text>
            <View style={styles.cursor} />
          </View>
        )}
      </ScrollView>

      {/* Stream button */}
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
  toggleRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    justifyContent: 'center',
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
  },
  toggleActive: { backgroundColor: '#007AFF' },
  toggleText: { fontSize: 14, color: '#333' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
  messageList: { flex: 1 },
  messageContent: { padding: 16, gap: 8, paddingBottom: 16 },
  bubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '80%',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  messageText: { fontSize: 16, lineHeight: 24 },
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
})
