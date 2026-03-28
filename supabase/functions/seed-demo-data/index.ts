import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get auth header to find the calling user's company
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Not authenticated");

    // Get company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    
    if (!profile?.company_id) throw new Error("No company found");
    const companyId = profile.company_id;

    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    
    if (!roles?.length) throw new Error("Admin only");

    // Get locations
    const { data: locations } = await supabase
      .from("locations")
      .select("id, name")
      .eq("company_id", companyId);

    // Create locations if none exist
    let locationIds: string[] = [];
    if (!locations?.length) {
      const locNames = ["Downtown", "Uptown", "Westside"];
      for (const name of locNames) {
        const { data } = await supabase
          .from("locations")
          .insert({ name, company_id: companyId })
          .select("id")
          .single();
        if (data) locationIds.push(data.id);
      }
    } else {
      locationIds = locations.map((l) => l.id);
    }

    // Create 6 demo staff users
    const staffNames = [
      "Alex Johnson", "Sam Rivera", "Jordan Chen",
      "Taylor Kim", "Morgan Lee", "Casey Patel",
    ];
    
    const createdUserIds: string[] = [];
    for (let i = 0; i < staffNames.length; i++) {
      const email = `demo.${staffNames[i].toLowerCase().replace(" ", ".")}@example.com`;
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: "DemoPass123!",
        email_confirm: true,
        user_metadata: { full_name: staffNames[i] },
      });

      if (authError) {
        // User may already exist, skip
        console.log(`Skipping ${email}: ${authError.message}`);
        continue;
      }

      const userId = authUser.user.id;
      createdUserIds.push(userId);

      // Update profile with company_id and random XP
      const xp = Math.floor(Math.random() * 500) + 50;
      const streak = Math.floor(Math.random() * 14);
      await supabase
        .from("profiles")
        .update({
          company_id: companyId,
          full_name: staffNames[i],
          xp,
          current_streak: streak,
          longest_streak: streak + Math.floor(Math.random() * 5),
        })
        .eq("user_id", userId);

      // Assign staff role with location
      const locId = locationIds[i % locationIds.length] || null;
      await supabase.from("user_roles").insert({
        user_id: userId,
        company_id: companyId,
        role: "staff",
        location_id: locId,
      });
    }

    // Create demo learning paths
    const pathsData = [
      {
        title: "Food Safety Fundamentals",
        description: "Essential food safety knowledge for all team members",
        courses: [
          {
            title: "Personal Hygiene",
            lessons: [
              {
                title: "Handwashing Basics",
                blocks: [
                  { block_type: "section", title: "Why Handwashing Matters", content: "Proper handwashing is the #1 way to prevent foodborne illness in restaurants." },
                  { block_type: "card", title: "The 20-Second Rule", content: "Always wash your hands for at least 20 seconds with warm water and soap. Scrub between fingers, under nails, and up to your wrists." },
                  { block_type: "question", question_type: "multiple_choice", title: "How long should you wash your hands?", correct_answer: "20 seconds", options: ["5 seconds", "10 seconds", "20 seconds", "1 minute"] },
                  { block_type: "question", question_type: "true_false", title: "You should wash your hands after touching your face", correct_answer: "True" },
                ],
              },
              {
                title: "Proper Glove Usage",
                blocks: [
                  { block_type: "section", title: "When to Wear Gloves", content: "Gloves are required when handling ready-to-eat foods." },
                  { block_type: "card", title: "Changing Gloves", content: "Change gloves: between tasks, after touching raw meat, every hour during continuous use, and after touching your face or hair." },
                  { block_type: "question", question_type: "multiple_choice", title: "When should you change gloves?", correct_answer: "All of the above", options: ["After touching raw meat", "Between tasks", "Every hour during continuous use", "All of the above"] },
                ],
              },
            ],
          },
          {
            title: "Temperature Control",
            lessons: [
              {
                title: "The Danger Zone",
                blocks: [
                  { block_type: "section", title: "Temperature Danger Zone", content: "The danger zone is between 41°F and 135°F (5°C and 57°C)." },
                  { block_type: "card", title: "The 2-Hour Rule", content: "Food left in the danger zone for more than 2 hours must be discarded. In temperatures above 90°F, this drops to 1 hour." },
                  { block_type: "question", question_type: "multiple_choice", title: "What is the temperature danger zone?", correct_answer: "41°F - 135°F", options: ["32°F - 100°F", "41°F - 135°F", "50°F - 150°F", "60°F - 120°F"] },
                  { block_type: "question", question_type: "true_false", title: "Food can stay in the danger zone for up to 4 hours safely", correct_answer: "False" },
                ],
              },
              {
                title: "Proper Food Storage",
                blocks: [
                  { block_type: "card", title: "FIFO Method", content: "First In, First Out. Always use older inventory before newer stock. Label everything with dates." },
                  { block_type: "question", question_type: "free_text", title: "What does FIFO stand for?", correct_answer: "First In First Out" },
                ],
              },
            ],
          },
        ],
      },
      {
        title: "Customer Service Excellence",
        description: "Learn how to deliver outstanding customer experiences",
        courses: [
          {
            title: "First Impressions",
            lessons: [
              {
                title: "Greeting Customers",
                blocks: [
                  { block_type: "section", title: "The Power of a Greeting", content: "First impressions are formed within 7 seconds of interaction." },
                  { block_type: "card", title: "The Perfect Greeting", content: "Make eye contact, smile genuinely, use a warm tone, and acknowledge the customer within 30 seconds of arrival." },
                  { block_type: "question", question_type: "multiple_choice", title: "How quickly are first impressions formed?", correct_answer: "7 seconds", options: ["3 seconds", "7 seconds", "30 seconds", "1 minute"] },
                ],
              },
              {
                title: "Reading Body Language",
                blocks: [
                  { block_type: "card", title: "Open vs Closed Body Language", content: "Open body language (uncrossed arms, eye contact, leaning in) signals engagement. Closed body language may mean the customer is uncomfortable or frustrated." },
                  { block_type: "question", question_type: "true_false", title: "Crossed arms always mean a customer is angry", correct_answer: "False" },
                ],
              },
            ],
          },
          {
            title: "Handling Complaints",
            lessons: [
              {
                title: "The HEARD Method",
                blocks: [
                  { block_type: "section", title: "HEARD Framework", content: "A 5-step process for handling any customer complaint effectively." },
                  { block_type: "card", title: "H.E.A.R.D.", content: "Hear - Listen actively without interrupting\nEmpathize - Show you understand their frustration\nApologize - Sincerely say sorry\nResolve - Fix the problem\nDiagnose - Understand why it happened to prevent recurrence" },
                  { block_type: "question", question_type: "multiple_choice", title: "What does the 'E' in HEARD stand for?", correct_answer: "Empathize", options: ["Explain", "Empathize", "Evaluate", "Escalate"] },
                ],
              },
            ],
          },
        ],
      },
      {
        title: "Workplace Safety",
        description: "Stay safe and prevent accidents on the job",
        courses: [
          {
            title: "Slip & Fall Prevention",
            lessons: [
              {
                title: "Keeping Floors Safe",
                blocks: [
                  { block_type: "card", title: "Common Causes", content: "Wet floors, grease spills, loose mats, and cluttered walkways are the leading causes of slip-and-fall accidents." },
                  { block_type: "question", question_type: "true_false", title: "You should clean up spills immediately", correct_answer: "True" },
                  { block_type: "question", question_type: "multiple_choice", title: "What should you use to mark a wet floor?", correct_answer: "Wet floor sign", options: ["Napkin on the floor", "Wet floor sign", "Verbal warning only", "Nothing, it will dry"] },
                ],
              },
            ],
          },
          {
            title: "Lifting Techniques",
            lessons: [
              {
                title: "Safe Lifting",
                blocks: [
                  { block_type: "card", title: "Proper Form", content: "Bend at the knees (not the waist), keep the load close to your body, tighten your core, and lift smoothly. Ask for help with heavy items over 50 lbs." },
                  { block_type: "question", question_type: "true_false", title: "You should bend at the waist when lifting heavy objects", correct_answer: "False" },
                ],
              },
            ],
          },
        ],
      },
    ];

    // Insert learning paths, courses, lessons, and content
    for (let pi = 0; pi < pathsData.length; pi++) {
      const pathData = pathsData[pi];
      const { data: path, error: pathErr } = await supabase
        .from("learning_paths")
        .insert({
          title: pathData.title,
          description: pathData.description,
          company_id: companyId,
          sort_order: pi,
          is_published: true,
          enforce_order: true,
        })
        .select("id")
        .single();

      if (pathErr || !path) {
        console.error("Path error:", pathErr);
        continue;
      }

      // Create "all" assignment for this path
      await supabase.from("path_assignments").insert({
        learning_path_id: path.id,
        company_id: companyId,
        assign_type: "all",
        is_active: true,
        auto_assign: true,
      });

      for (let ci = 0; ci < pathData.courses.length; ci++) {
        const courseData = pathData.courses[ci];
        const { data: course, error: courseErr } = await supabase
          .from("courses")
          .insert({
            title: courseData.title,
            learning_path_id: path.id,
            sort_order: ci,
            is_published: true,
          })
          .select("id")
          .single();

        if (courseErr || !course) continue;

        for (let li = 0; li < courseData.lessons.length; li++) {
          const lessonData = courseData.lessons[li];
          const { data: lesson, error: lessonErr } = await supabase
            .from("lessons")
            .insert({
              title: lessonData.title,
              course_id: course.id,
              sort_order: li,
              is_published: true,
              xp_reward: 10,
            })
            .select("id")
            .single();

          if (lessonErr || !lesson) continue;

          for (let bi = 0; bi < lessonData.blocks.length; bi++) {
            const block = lessonData.blocks[bi];
            await supabase.from("lesson_content").insert({
              lesson_id: lesson.id,
              block_type: block.block_type,
              title: block.title,
              content: block.content || null,
              question_type: block.question_type || null,
              correct_answer: block.correct_answer || null,
              options: block.options || null,
              sort_order: bi,
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Created ${pathsData.length} learning paths with courses/lessons and ${createdUserIds.length} demo staff users`,
        users_created: createdUserIds.length,
        demo_credentials: {
          password: "DemoPass123!",
          emails: staffNames.map((n) => `demo.${n.toLowerCase().replace(" ", ".")}@example.com`),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
