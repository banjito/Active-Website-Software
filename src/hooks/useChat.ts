import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { ChatRoom, ChatMessage } from '@/types/chat';

export function useChat() {
  const { user } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbSetupComplete, setDbSetupComplete] = useState<boolean | null>(null);
  
  // Use refs to prevent unnecessary re-subscriptions
  const subscriptionsRef = useRef<Record<string, any>>({});
  const userProfilesCache = useRef<Record<string, any>>({});

  // Computed messages for the current room only (filtered to last 24 hours)
  const messages = useMemo(() => {
    if (!currentRoom) return [];
    const roomMessages = messagesMap[currentRoom.id] || [];
    
    // Filter messages to only show those from the last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    return roomMessages.filter(message => {
      const messageTime = new Date(message.created_at);
      return messageTime > twentyFourHoursAgo;
    });
  }, [messagesMap, currentRoom]);

  // Optimized helper to update messages for a specific room
  const updateRoomMessages = useCallback((roomId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessagesMap(prev => {
      const currentMessages = prev[roomId] || [];
      const newMessages = updater(currentMessages);
      
      // Only update if messages actually changed
      if (JSON.stringify(currentMessages) === JSON.stringify(newMessages)) {
        return prev;
      }
      
      return {
        ...prev,
        [roomId]: newMessages
      };
    });
  }, []);

  // Check if the chat database setup is complete
  const checkDatabaseSetup = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase
        .schema('common')
        .rpc('get_user_chat_rooms');
      
      if (rpcError) {
        console.error("Database setup check failed - RPC error:", rpcError);
        setDbSetupComplete(false);
        setError(`The chat system is not properly set up. Please navigate to /chat-debug for more information. Error: ${rpcError.message}`);
        return false;
      }
      
      setDbSetupComplete(true);
      return true;
    } catch (err) {
      console.error("Database setup check failed:", err);
      setDbSetupComplete(false);
      setError('The chat system is not properly set up. Please navigate to /chat-debug for more information.');
      return false;
    }
  }, []);

  // Optimized fetch chat rooms
  const fetchChatRooms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (dbSetupComplete === null) {
        const isSetupComplete = await checkDatabaseSetup();
        if (!isSetupComplete) {
          setLoading(false);
          return;
        }
      }
      
      const { data, error } = await supabase
        .schema('common')
        .rpc('get_user_chat_rooms');
      
      if (error) {
        console.error("Error fetching chat rooms:", error);
        throw error;
      }
      
      setChatRooms(data as ChatRoom[]);
      
      // Set the first room as current if none is selected
      if (!currentRoom && data.length > 0) {
        setCurrentRoom(data[0]);
      }
    } catch (err: any) {
      console.error('Error fetching chat rooms:', err);
      setError(`Failed to load chat rooms: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [dbSetupComplete, currentRoom, checkDatabaseSetup]);

  // Mark a room's messages as read
  const markRoomAsRead = useCallback(async (roomId: string) => {
    try {
      if (!user) return;
      
      const { error } = await supabase
        .schema('common')
        .rpc('mark_room_messages_read', { p_room_id: roomId });
      
      if (error) {
        console.error('Error marking room as read:', error);
        return false;
      }
      
      setChatRooms(prev => 
        prev.map(room => 
          room.id === roomId 
            ? { ...room, unread_count: 0 } 
            : room
        )
      );
      
      return true;
    } catch (err) {
      console.error('Error in markRoomAsRead:', err);
      return false;
    }
  }, [user]);

     // Helper function to generate fallback avatar from name
   const getFallbackPhotoFromName = useCallback((name: string) => {
     return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4f46e5&color=fff&size=128`;
   }, []);

   // Get user profile from cache or fetch it
   const getUserProfile = useCallback(async (userId: string) => {
     // Check cache first
     if (userProfilesCache.current[userId]) {
       return userProfilesCache.current[userId];
     }

     // Special handling for current user - use auth context data first
     if (user && userId === user.id) {
       const currentUserProfile = {
         email: user.email || '',
         name: user.user_metadata?.name || user.user_metadata?.full_name || user.user_metadata?.username || user.email || 'You',
         profileImage: user.user_metadata?.profileImage || user.user_metadata?.avatar_url || null
       };
       
       // If no profile image, generate one from the name
       if (!currentUserProfile.profileImage) {
         currentUserProfile.profileImage = getFallbackPhotoFromName(currentUserProfile.name);
       }
       
       // Cache the current user profile
       userProfilesCache.current[userId] = currentUserProfile;
       return currentUserProfile;
     }

     try {
       const { data: profileData, error: profileError } = await supabase
         .schema('common')
         .from('profiles')
         .select('id, full_name, email, avatar_url')
         .eq('id', userId)
         .single();

       if (!profileError && profileData) {
         const name = profileData.full_name || profileData.email || `User ${userId.substring(0, 6)}`;
         const profile = {
           email: profileData.email || 'unknown',
           name: name,
           profileImage: profileData.avatar_url || getFallbackPhotoFromName(name)
         };
         
         // Cache the profile
         userProfilesCache.current[userId] = profile;
         return profile;
       }
     } catch (error) {
       console.warn('Error fetching user profile:', error);
     }

     // Fallback profile with generated avatar
     const fallbackName = `User ${userId.substring(0, 6)}`;
     const fallbackProfile = {
       email: 'unknown',
       name: fallbackName,
       profileImage: getFallbackPhotoFromName(fallbackName)
     };
     
     userProfilesCache.current[userId] = fallbackProfile;
     return fallbackProfile;
   }, [user, getFallbackPhotoFromName]);

  // Optimized fetch messages
  const fetchMessages = useCallback(async (roomId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Mark as read before fetching messages
      await supabase
        .schema('common')
        .rpc('mark_room_messages_read', { p_room_id: roomId });
      
      // Fetch messages (only from the last 24 hours)
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const { data: messageData, error: messageError } = await supabase
        .schema('common')
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .order('created_at', { ascending: true });
      
      if (messageError) throw messageError;
      
      if (messageData && messageData.length > 0) {
        // Process messages with user data efficiently
        const messagesWithUsers = await Promise.all(
          messageData.map(async (message) => {
            const userProfile = await getUserProfile(message.user_id);
            return {
              ...message,
              user: userProfile
            };
          })
        );
        
        updateRoomMessages(roomId, () => messagesWithUsers);
      } else {
        updateRoomMessages(roomId, () => []);
      }
      
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setError(`Failed to load messages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [updateRoomMessages, getUserProfile]);

  // Optimized send message
  const sendMessage = useCallback(async (content: string) => {
    if (!user || !currentRoom || !content.trim()) return;
    
    const roomId = currentRoom.id;
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    
    setSendingMessage(true);
    setError(null);
    
    try {
      // Get user profile for optimistic update
      const userProfile = await getUserProfile(user.id);
      
      // Create optimistic message
      const optimisticMessage: ChatMessage = {
        id: tempId,
        room_id: roomId,
        user_id: user.id,
        content: content.trim(),
        created_at: now,
        updated_at: now,
        user: userProfile
      };
      
      // Add message optimistically
      updateRoomMessages(roomId, prev => [...prev, optimisticMessage]);
      
      // Update chat rooms with new message
      setChatRooms(prev => 
        prev.map(room => {
          if (room.id === roomId) {
            return {
              ...room,
              last_message: content.trim(),
              last_message_time: now,
              unread_count: 0
            };
          }
          return room;
        })
      );
      
      // Insert into database
      const { data, error } = await supabase
        .schema('common')
        .from('chat_messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          content: content.trim()
        })
        .select();
      
      if (error) {
        console.error('Error sending message:', error);
        // Remove optimistic message on error
        updateRoomMessages(roomId, prev => 
          prev.filter(message => message.id !== tempId)
        );
        setError(error.message);
        return;
      }
      
      // Replace optimistic message with real one
      if (data && data.length > 0) {
        const realMessage = data[0];
        updateRoomMessages(roomId, prev => 
          prev.map(message => 
            message.id === tempId 
              ? { ...realMessage, user: userProfile }
              : message
          )
        );
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Unknown error sending message');
    } finally {
      setSendingMessage(false);
    }
  }, [user, currentRoom, updateRoomMessages, getUserProfile]);

  // Setup real-time subscriptions
  useEffect(() => {
    if (!user || !currentRoom) return;
    
    const roomId = currentRoom.id;
    const subscriptionKey = `messages-${roomId}`;
    
    // Clean up existing subscription for this room
    if (subscriptionsRef.current[subscriptionKey]) {
      subscriptionsRef.current[subscriptionKey].unsubscribe();
    }
    
    // Create new subscription
    const messagesSubscription = supabase
      .channel(`chat-messages-room-${roomId}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'common', 
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`
        },
        async (payload) => {
          const newMessage = payload.new as ChatMessage;
          
          // Skip if not for current room
          if (newMessage.room_id !== roomId) return;
          
          // Check if message already exists
          const currentMessages = messagesMap[roomId] || [];
          const messageExists = currentMessages.some(m => 
            m.id === newMessage.id ||
            (m.id.startsWith('temp-') && 
             m.user_id === newMessage.user_id && 
             m.content === newMessage.content && 
             Math.abs(new Date(m.created_at).getTime() - new Date(newMessage.created_at).getTime()) < 10000)
          );
          
          if (messageExists) return;
          
          // Get user profile and add message
          const userProfile = await getUserProfile(newMessage.user_id);
          const messageWithUser = {
            ...newMessage,
            user: userProfile
          };
          
          updateRoomMessages(roomId, prev => [...prev, messageWithUser]);
          
          // Update chat rooms
          setChatRooms(prev => 
            prev.map(room => {
              if (room.id === roomId) {
                return {
                  ...room,
                  last_message: newMessage.content,
                  last_message_time: newMessage.created_at,
                  unread_count: 0
                };
              }
              return room;
            })
          );
        }
      )
      .subscribe();
    
    subscriptionsRef.current[subscriptionKey] = messagesSubscription;
    
    // Cleanup function
    return () => {
      if (subscriptionsRef.current[subscriptionKey]) {
        subscriptionsRef.current[subscriptionKey].unsubscribe();
        delete subscriptionsRef.current[subscriptionKey];
      }
    };
  }, [user, currentRoom?.id, messagesMap, updateRoomMessages, getUserProfile]);

  // Setup chat rooms subscription
  useEffect(() => {
    if (!user) return;
    
    const roomsSubscription = supabase
      .channel('chat-rooms-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'common', table: 'chat_rooms' },
        () => {
          fetchChatRooms();
        }
      )
      .subscribe();
    
    fetchChatRooms();
    
    return () => {
      roomsSubscription.unsubscribe();
    };
  }, [user, fetchChatRooms]);
  
  // Fetch messages when room changes
  useEffect(() => {
    if (currentRoom) {
      if (!messagesMap[currentRoom.id] || messagesMap[currentRoom.id].length === 0) {
        fetchMessages(currentRoom.id);
      }
    }
  }, [currentRoom?.id, messagesMap, fetchMessages]);

  // Cleanup all subscriptions on unmount
  useEffect(() => {
    return () => {
      Object.values(subscriptionsRef.current).forEach(subscription => {
        subscription?.unsubscribe();
      });
      subscriptionsRef.current = {};
    };
  }, []);

  return {
    chatRooms,
    currentRoom,
    messages,
    loading,
    sendingMessage,
    error,
    setCurrentRoom,
    sendMessage,
    markRoomAsRead,
    refreshRooms: fetchChatRooms,
    refreshMessages: () => currentRoom && fetchMessages(currentRoom.id)
  };
}