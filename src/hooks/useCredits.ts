import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useCredits = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["credits", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_credits" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { total_credits: 3, used_credits: 0, remaining: 3 };
      return {
        total_credits: (data as any).total_credits as number,
        used_credits: (data as any).used_credits as number,
        remaining: ((data as any).total_credits - (data as any).used_credits) as number,
      };
    },
  });
};

export const useInvalidateCredits = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["credits"] });
};
