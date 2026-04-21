import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, onSnapshot, orderBy, limit, where, type QueryConstraint } from "firebase/firestore";

export function useCollection<T>(
  path: string,
  ...constraints: QueryConstraint[]
): { data: T[]; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    const ref = collection(db, path);
    const q = constraints.length > 0 ? query(ref, ...constraints) : ref;

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as T));
        setData(docs);
        setLoading(false);
      },
      (err) => { setError(err); setLoading(false); }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return { data, loading, error };
}

export { orderBy, limit, where };
