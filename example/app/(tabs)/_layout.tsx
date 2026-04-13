import { Tabs } from 'expo-router'
import { Platform } from 'react-native'

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarStyle: Platform.OS === 'ios' ? { backgroundColor: '#fafafa' } : undefined,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', headerShown: false }} />
      <Tabs.Screen name="demos" options={{ title: 'Demos' }} />
      <Tabs.Screen name="bug-fixes" options={{ title: 'Bug Fixes' }} />
      <Tabs.Screen name="tools" options={{ title: 'Tools' }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
    </Tabs>
  )
}
