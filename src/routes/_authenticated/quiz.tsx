import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { offlineInsert, currentUserId } from "@/lib/offline/mutations";
import {
  POINTS_CORRECT, POINTS_WRONG, bibleLogsQO, buildLearnFacts, buildQuizBank, factOfTheDay,
  makeRng, pointsSummary, qkQuizAttempts, quizAttemptsQO, seedFromString, sermonsQO, studiesQO, ymdLocal,
  type QuizQuestion,
} from "@/lib/spiritual";
import { Brain, Sparkles, RefreshCw, Trophy, Flame, CheckCircle2, XCircle, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({
    meta: [
      { title: "Quiz & Learn fact — OPTIS" },
      { name: "description", content: "QCM aléatoire tiré de vos lectures, sermons et études, système de points avec statut, et un « le saviez-vous » chaque jour." },
      { property: "og:title", content: "Quiz & Learn fact — OPTIS" },
      { property: "og:description", content: "Gagnez des points en répondant au quiz quotidien issu de vos propres notes spirituelles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Quiz & Learn fact — OPTIS" },
      { name: "twitter:description", content: "Quiz aléatoire, points, statut et fait du jour." },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const qc = useQueryClient();
  const { data: sermons = [] } = useQuery(sermonsQO);
  const { data: studies = [] } = useQuery(studiesQO);
  const { data: logs = [] } = useQuery(bibleLogsQO);
  const { data: attempts = [] } = useQuery(quizAttemptsQO);

  const today = ymdLocal(new Date());
  const [seed, setSeed] = useState(0);
  const [current, setCurrent] = useState<QuizQuestion | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const bank = useMemo(
    () => buildQuizBank(sermons, studies, logs, makeRng(seedFromString(`${today}-${seed}`))),
    [sermons, studies, logs, today, seed],
  );

  const facts = useMemo(() => buildLearnFacts(sermons, studies, logs), [sermons, studies, logs]);
  const fact = useMemo(() => factOfTheDay(facts, `${today}-${seed}`), [facts, today, seed]);

  const summary = useMemo(() => pointsSummary(attempts), [attempts]);

  const question = current ?? bank[0] ?? null;

  function nextQuestion() {
    if (!bank.length) return;
    const rng = makeRng(seedFromString(`${today}-${seed}-${Math.random()}`));
    setCurrent(bank[Math.floor(rng() * bank.length)]);
    setPicked(null);
    setLocked(false);
  }

  async function answer(option: string) {
    if (!question || locked) return;
    setPicked(option);
    setLocked(true);
    const correct = option === question.answer;
    const points = correct ? POINTS_CORRECT : POINTS_WRONG;
    try {
      const user_id = await currentUserId();
      await offlineInsert("quiz_attempts", {
        user_id,
        asked_on: today,
        source: question.source,
        question: question.prompt,
        answer: option,
        correct,
        points,
      });
      qc.invalidateQueries({ queryKey: qkQuizAttempts });
    } catch {
      /* la file hors ligne prend le relais */
    }
    if (correct) toast.success(`Bonne réponse · +${POINTS_CORRECT} points`);
    else toast.error(`Mauvaise réponse · ${POINTS_WRONG} point`);
  }

  const tier = summary.tier;
  const tierPct = summary.nextTierAt ? Math.max(0, Math.min(100, ((summary.total - tier.min) / (summary.nextTierAt - tier.min)) * 100)) : 100;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><Brain className="h-5 w-5 text-primary" /> Quiz &amp; Learn fact</h1>
          <p className="text-sm text-muted-foreground">Questions et faits tirés de vos lectures, sermons et études.</p>
        </div>
        <Button variant="outline" onClick={() => { setSeed((s) => s + 1); setCurrent(null); setPicked(null); setLocked(false); }}>
          <RefreshCw className="mr-1 h-4 w-4" /> Nouveau tirage
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Points" value={summary.total} sub={`${summary.earned} gagnés · ${summary.decay} d'inactivité`} tone={summary.total >= 10 ? "positive" : summary.total < 6 ? "negative" : "warning"} icon={<Trophy className="h-4 w-4" />} />
        <StatCard label="Statut" value={<span className={cn("rounded-sm px-2 py-0.5 text-base", tier.className)}>{tier.label}</span>} sub={tier.advice} />
        <StatCard label="Série" value={`${summary.streak} j`} sub={`${summary.idleDays} jours sans participation`} tone={summary.streak > 0 ? "positive" : "neutral"} icon={<Flame className="h-4 w-4" />} />
        <StatCard label="Précision" value={`${summary.accuracy.toFixed(0)} %`} sub={`${summary.correct}/${summary.answered} réponses · ${summary.todayAnswered} aujourd'hui`} />
      </div>

      {summary.nextTierAt && (
        <Panel title={`Progression vers le statut suivant (${summary.nextTierAt} points)`}>
          <Progress value={tierPct} />
          <p className="mt-2 text-xs text-muted-foreground">
            Bonne réponse : +{POINTS_CORRECT} points. Mauvaise réponse : {POINTS_WRONG} point. Chaque journée sans aucune réponse retire 1 point.
          </p>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="QCM aléatoire" action={<Badge variant="outline">{bank.length} questions disponibles</Badge>}>
          {!question ? (
            <p className="text-sm text-muted-foreground">
              Aucune question pour l'instant : ajoutez des notes de sermon, des études ou des lectures pour alimenter le quiz.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/15 text-primary">
                  {question.source === "sermon" ? "Sermon" : question.source === "study" ? "Étude" : "Lecture"}
                </Badge>
                {question.hint && <span className="text-xs text-muted-foreground">{question.hint}</span>}
              </div>
              <p className="text-sm font-medium">{question.prompt}</p>
              <div className="grid gap-2">
                {question.options.map((o) => {
                  const isAnswer = o === question.answer;
                  const isPicked = o === picked;
                  return (
                    <button
                      key={o}
                      disabled={locked}
                      onClick={() => answer(o)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-sm border border-border px-3 py-2 text-left text-sm transition-colors",
                        !locked && "hover:bg-surface-2",
                        locked && isAnswer && "border-emerald-500/50 bg-emerald-500/10",
                        locked && isPicked && !isAnswer && "border-red-500/50 bg-red-500/10",
                      )}
                    >
                      <span>{o}</span>
                      {locked && isAnswer && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      {locked && isPicked && !isAnswer && <XCircle className="h-4 w-4 text-red-400" />}
                    </button>
                  );
                })}
              </div>
              {locked && (
                <Button className="w-full" onClick={nextQuestion}>Question suivante</Button>
              )}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Le saviez-vous ?" action={<Sparkles className="h-4 w-4 text-primary" />}>
            {!fact ? (
              <p className="text-sm text-muted-foreground">Ajoutez des faits clés dans vos études pour recevoir un fait personnalisé chaque jour.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium">{fact.title}</span>
                </div>
                <p className="text-sm">{fact.body}</p>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{fact.source}</div>
              </div>
            )}
          </Panel>

          <Panel title="Dernières réponses">
            {!attempts.length ? (
              <p className="text-sm text-muted-foreground">Aucune participation enregistrée.</p>
            ) : (
              <div className="max-h-[260px] space-y-1.5 overflow-y-auto">
                {attempts.slice(0, 30).map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-2 rounded-sm border border-border px-2.5 py-1.5 text-xs">
                    <span className="line-clamp-2">{a.question}</span>
                    <span className={cn("num shrink-0", a.correct ? "text-positive" : "text-negative")}>{a.points > 0 ? `+${a.points}` : a.points}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
