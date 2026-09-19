import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { StreakDoc, UserDoc } from "../lib/types";

interface AuthValue {
  user: User | null;
  profile: UserDoc | null;
  streak: StreakDoc | null;
  isAdmin: boolean;
  loading: boolean;
  profileError: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({ user: null, profile: null, streak: null, isAdmin: false, loading: true, profileError: null, logout: async () => undefined });

/**
 * Single subscription point for auth state, the private user doc and the streak doc.
 * Pages read from here instead of opening their own listeners.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [streak, setStreak] = useState<StreakDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setStreak(null);
        setIsAdmin(false);
        setProfileReady(true);
        return;
      }
      setProfileReady(false);
      try {
        const token = await nextUser.getIdTokenResult();
        const isOwner = nextUser.email?.toLowerCase() === "uday12462@gmail.com" || nextUser.email?.toLowerCase() === "admin@vidyapath.demo";
        setIsAdmin(token.claims.admin === true || isOwner);
      } catch (error) {
        console.error("Could not read auth claims", error);
        const isOwner = nextUser.email?.toLowerCase() === "uday12462@gmail.com" || nextUser.email?.toLowerCase() === "admin@vidyapath.demo";
        setIsAdmin(isOwner);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileError(null);
    const unsubscribeProfile = onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        setProfile(snapshot.exists() ? (snapshot.data() as UserDoc) : null);
        setProfileReady(true);
      },
      (error) => {
        console.error("Profile listener failed", error);
        setProfileError("Could not load your profile. Check your connection and refresh.");
        setProfileReady(true);
      }
    );
    const unsubscribeStreak = onSnapshot(
      doc(db, "streaks", user.uid),
      (snapshot) => setStreak(snapshot.exists() ? (snapshot.data() as StreakDoc) : null),
      (error) => console.error("Streak listener failed", error)
    );
    return () => {
      unsubscribeProfile();
      unsubscribeStreak();
    };
  }, [user]);

  const value = useMemo<AuthValue>(
    () => ({ user, profile, streak, isAdmin, loading: !authReady || (user !== null && !profileReady), profileError, logout: () => signOut(auth) }),
    [user, profile, streak, isAdmin, authReady, profileReady, profileError]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
