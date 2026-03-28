
-- Add rewards_enabled toggle to companies
ALTER TABLE public.companies ADD COLUMN rewards_enabled boolean NOT NULL DEFAULT false;

-- Create rewards table
CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  xp_cost integer NOT NULL,
  quantity_limit integer,
  quantity_redeemed integer NOT NULL DEFAULT 0,
  custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert rewards" ON public.rewards FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update rewards" ON public.rewards FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete rewards" ON public.rewards FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view active company rewards" ON public.rewards FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND (is_active = true OR has_role(auth.uid(), 'admin')));

-- Create reward_redemptions table
CREATE TABLE public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  xp_spent integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own redemptions" ON public.reward_redemptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own redemptions" ON public.reward_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view company redemptions" ON public.reward_redemptions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rewards r WHERE r.id = reward_redemptions.reward_id
    AND r.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can update company redemptions" ON public.reward_redemptions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rewards r WHERE r.id = reward_redemptions.reward_id
    AND r.company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin')
  ));

-- Atomic redeem function
CREATE OR REPLACE FUNCTION public.redeem_reward(_user_id uuid, _reward_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reward RECORD;
  _user_xp integer;
  _has_role boolean;
BEGIN
  -- Lock and fetch reward
  SELECT * INTO _reward FROM rewards WHERE id = _reward_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward not found or inactive');
  END IF;

  -- Check quantity
  IF _reward.quantity_limit IS NOT NULL AND _reward.quantity_redeemed >= _reward.quantity_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward is sold out');
  END IF;

  -- Check custom role eligibility
  IF _reward.custom_role_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_custom_roles WHERE user_id = _user_id AND custom_role_id = _reward.custom_role_id
    ) INTO _has_role;
    IF NOT _has_role THEN
      RETURN jsonb_build_object('success', false, 'error', 'You are not eligible for this reward');
    END IF;
  END IF;

  -- Check XP
  SELECT xp INTO _user_xp FROM profiles WHERE user_id = _user_id;
  IF _user_xp IS NULL OR _user_xp < _reward.xp_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough XP');
  END IF;

  -- Deduct XP
  UPDATE profiles SET xp = xp - _reward.xp_cost WHERE user_id = _user_id;

  -- Increment quantity_redeemed
  UPDATE rewards SET quantity_redeemed = quantity_redeemed + 1 WHERE id = _reward_id;

  -- Insert redemption
  INSERT INTO reward_redemptions (reward_id, user_id, xp_spent)
  VALUES (_reward_id, _user_id, _reward.xp_cost);

  RETURN jsonb_build_object('success', true);
END;
$$;
