import crypto from 'node:crypto';

const SESSION_TITLE_KINDS = [
	"feature",
	"design",
	"fix",
	"optimize",
	"release",
	"explore",
	"docs",
	"research"
];

const SESSION_TITLE_EMOJI = {
	feature: "✨",
	design: "🎨",
	fix: "🐛",
	optimize: "⚡",
	release: "🚀",
	explore: "🔍",
	docs: "📝",
	research: "🔬"
};

const TYPE_LABELS_ZH = {
	feature: "功能",
	design: "设计",
	fix: "修复",
	optimize: "优化",
	release: "发布",
	explore: "探索",
	docs: "文档",
	research: "研究"
};

const TYPE_LABELS_EN = {
	feature: "Feature",
	design: "Design",
	fix: "Fix",
	optimize: "Optimize",
	release: "Release",
	explore: "Explore",
	docs: "Docs",
	research: "Research"
};

const GENERIC_THEME_SUFFIXES = [
	"类型", "分类", "相关", "需求", "问题", "会话", "标题", "主题", "内容",
	"type", "category", "related", "request", "issue", "session", "title", "topic", "content"
];

const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)+\s*/u;
const TITLE_SEPARATORS = /[|｜│]/g;

function typeLabel(kind, locale) {
	return locale === "en" ? TYPE_LABELS_EN[kind] : TYPE_LABELS_ZH[kind];
}

function typeAliasMap() {
	const aliases = new Map();
	for (const kind of SESSION_TITLE_KINDS) {
		aliases.set(kind, kind);
		aliases.set(TYPE_LABELS_ZH[kind], kind);
		aliases.set(TYPE_LABELS_EN[kind].toLowerCase(), kind);
	}
	return aliases;
}

const TYPE_ALIASES = typeAliasMap();

function resolveKind(raw) {
	return TYPE_ALIASES.get(raw) ?? TYPE_ALIASES.get(raw.toLowerCase());
}

function sessionTitleTypeLabels(locale) {
	return SESSION_TITLE_KINDS.map((kind) => typeLabel(kind, locale)).join(locale === "en" ? ", " : "、");
}

function sessionTitlePrompt(locale) {
	const types = sessionTitleTypeLabels(locale);
	if (locale === "en") {
		return {
			system: `Generate a title for a coding-assistant conversation.\nOutput exactly one line with two parts: Type｜Theme\nType must be one of: ${types}\nThe theme must be a concrete subject and must not repeat the type. Do not write dates, emoji, quotes, prefixes, explanations, or Markdown.\nWrite the theme in the language of the user message.`,
			userFrame: "Generate a conversation title from this user message. Return only one Type｜Theme line. Do not add a third part or repeat the theme."
		};
	}
	return {
		system: `为编程助手会话生成标题。\n只输出一行，恰好两段：类型｜主题\n类型必须是其中一个：${types}\n主题必须是具体事项，不能重复类型，不要写类型名或空主题。不要写日期或表情，不要引号、前缀、解释或 Markdown。\n主题使用用户消息的语言。`,
		userFrame: "根据这条用户消息生成会话标题。只返回“类型｜主题”一行，不要第三段，不要重复主题。"
	};
}

function inferLocaleFromMessage(text) {
	if (!text || text.trim() === "") return "zh";
	if (/[㐀-鿿]/.test(text)) return "zh";
	if (/[A-Za-z]/.test(text)) return "en";
	return "zh";
}

function compactMessageTheme(message) {
	const line = message.replace(/\s+/g, " ").trim();
	if (Buffer.byteLength(line, "utf8") <= 40) return line;
	let used = 0;
	let output = "";
	for (const character of line) {
		const bytes = Buffer.byteLength(character, "utf8");
		if (used + bytes > 40) break;
		output += character;
		used += bytes;
	}
	return output.trimEnd();
}

function alignThemeToMessage(theme, message) {
	const messageLocale = inferLocaleFromMessage(message);
	const themeLocale = inferLocaleFromMessage(theme);
	if (messageLocale === void 0 || themeLocale === void 0 || messageLocale === themeLocale) return theme;
	const fallback = compactMessageTheme(message);
	return fallback === "" ? theme : fallback;
}

function stripLeadingNoise(part) {
	const trimmed = part.trim();
	if (/^\d{4}$/.test(trimmed)) return "";
	return trimmed.replace(/^\d{4}\s*/, "").replace(LEADING_EMOJI, "").trim();
}

function parseTypeAndTheme(raw) {
	const parts = raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim().replace(TITLE_SEPARATORS, "｜").split("｜").map(stripLeadingNoise).filter((part) => part !== "");
	const type = parts[0];
	const theme = parts[1];
	if (!type || !theme) return void 0;
	const kind = resolveKind(type);
	if (!kind) return void 0;
	return { type: kind, theme };
}

function compactToken(value) {
	return value.replace(/[\s·.\-_/]/g, "");
}

function isRedundantAgainst(type, theme) {
	const normalized = compactToken(theme);
	const typeNorm = compactToken(type);
	if (normalized === "" || typeNorm === "") return false;
	if (normalized.toLowerCase() === typeNorm.toLowerCase()) return true;
	if (normalized.toLowerCase() === `新${typeNorm}`.toLowerCase()) return true;
	if (normalized.toLowerCase() === `new${typeNorm}`.toLowerCase()) return true;
	return GENERIC_THEME_SUFFIXES.some((suffix) => {
		const compactSuffix = compactToken(suffix);
		return normalized.toLowerCase() === compactSuffix.toLowerCase() || normalized.toLowerCase() === `${typeNorm}${compactSuffix}`.toLowerCase();
	});
}

function isRedundantTheme(type, theme) {
	const kind = resolveKind(type);
	const candidates = kind === void 0 ? [type] : [TYPE_LABELS_ZH[kind], TYPE_LABELS_EN[kind], kind];
	return candidates.some((label) => isRedundantAgainst(label, theme));
}

function assembleSessionTitle(type, theme, locale) {
	const parsed = parseTypeAndTheme(`${type}｜${theme}`);
	if (!parsed) return void 0;
	const displayLocale = locale ?? "zh";
	const label = typeLabel(parsed.type, displayLocale);
	const emoji = SESSION_TITLE_EMOJI[parsed.type] || "📌";
	const title = isRedundantTheme(parsed.type, parsed.theme)
		? `${emoji} ${label}`
		: `${emoji} ${label}｜${parsed.theme}`;
	if (Buffer.byteLength(title, "utf8") > 80) return void 0;
	return title;
}

function shouldSkipAutoTitle(session) {
	const id = session?.id || "";
	if (id.startsWith("dsh-automation-session-") || id.startsWith("im:")) return true;
	const origin = session.origin ?? session.header?.origin;
	if (origin === "subagent") return true;
	return false;
}

const SESSION_TITLE_PROVIDER_ID = "dsh-session-intent-title";
const MAX_INPUT_BYTES = 4096;
const MAX_OUTPUT_TOKENS = 1024; // 大白话：64 太小了，antigravity 的 gemini-3.8-flash 实际走 tiered 模型，思考 token 会把 64 的预算吃光，导致流以 max-tokens 结束、标题生成直接失败；提高到 1024 后实测正常
const TIMEOUT_MS = 60000;

async function collectText(chunks) {
	const parts = new Map();
	let finish = "stop";
	const part = (index) => {
		let existing = parts.get(index);
		if (!existing) {
			existing = { text: "", closed: false };
			parts.set(index, existing);
		}
		return existing;
	};
	for await (const chunk of chunks) {
		if (!chunk || typeof chunk !== "object") continue;
		if (chunk.type === "tool-call-delta" || chunk.block?.type === "tool-call") {
			throw new Error("intent session title output must be text");
		}
		if (chunk.type === "finish") {
			finish = typeof chunk.reason?.kind === "string" ? chunk.reason.kind : "unknown";
			continue;
		}
		if (chunk.type !== "text-delta" && chunk.type !== "block-end") continue;
		if (typeof chunk.index !== "number" || !Number.isSafeInteger(chunk.index)) continue;
		if (chunk.type === "text-delta") {
			if (typeof chunk.text !== "string") continue;
			const target = part(chunk.index);
			if (!target.closed) target.text += chunk.text;
			continue;
		}
		if (chunk.block?.type !== "text" || typeof chunk.block.text !== "string") continue;
		const target = part(chunk.index);
		if (target.closed) continue;
		target.text = chunk.block.text;
		target.closed = true;
	}
	if (finish !== "stop") throw new Error(`intent session title output finished with "${finish}"`);
	return [...parts.values()].map((segment) => segment.text).join("").trim().split(/\r?\n/, 1)[0] ?? "";
}

async function generateIntentSessionTitle(llm, request, locale = "zh") {
	request.signal?.throwIfAborted();
	const session = request.session;
	if (session === void 0 || shouldSkipAutoTitle(session)) throw new Error("session title skipped");
	const first = request.messages?.[0];
	const text = first?.text?.trim() ?? "";
	if (!first || text === "") throw new Error("session title missing message");
	const route = request.route;
	if (!route || !route.provider || !route.model) throw new Error("session title missing route");

	const prompt = sessionTitlePrompt(locale);
	const framed = `${prompt.userFrame}\n${JSON.stringify([{ seq: first.seq, text }])}`;
	if (Buffer.byteLength(framed, "utf8") > MAX_INPUT_BYTES) throw new Error("session title input too large");

	const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
	const signal = request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal;

	const messages = [{
		id: crypto.randomUUID(),
		role: "user",
		content: [{ type: "text", text: framed }],
		source: { kind: "plugin", plugin: "dsh-session-intent-title" }
	}];

	let chunks;
	if (typeof llm.prepareCall === "function") {
		const call = await llm.prepareCall({
			provider: route.provider,
			model: route.model,
			maxTokens: MAX_OUTPUT_TOKENS
		}, signal, (controls, model) => ({
			...controls,
			...model.reasoning?.efforts?.[0]?.id !== void 0 ? { reasoningEffort: model.reasoning.efforts[0].id } : {}
		}));
		chunks = call.stream({
			...call.config,
			messages,
			system: prompt.system,
			sessionId: session.id,
			purpose: "session-title",
			signal
		});
	} else {
		chunks = llm.stream({
			provider: route.provider,
			model: route.model,
			messages,
			system: prompt.system,
			maxTokens: MAX_OUTPUT_TOKENS,
			sessionId: session.id,
			purpose: "session-title",
			signal
		});
	}

	const raw = await collectText(chunks);
	signal.throwIfAborted();
	const parsed = parseTypeAndTheme(raw);
	if (!parsed) throw new Error("intent session title invalid model output: " + raw);

	const title = assembleSessionTitle(parsed.type, alignThemeToMessage(parsed.theme, text), locale);
	if (!title) throw new Error("intent session title rejected");

	return {
		title,
		messageSeqs: typeof first.seq === "number" ? [first.seq] : [],
		model: route
	};
}

const OFFICIAL_TARGETS = [
	{ id: "session-title-llm", name: "@deepseek-ai/dsh-session-title-first-prompt-llm" },
	{ id: "optional-session-title-all-prompts", name: "@deepseek-ai/dsh-session-title-all-prompts-llm" }
];

function isOfficialTarget(options) {
	if (!options) return false;
	return OFFICIAL_TARGETS.some((t) => t.id === options.id && t.name === options.name);
}

const guardRegistry = new WeakMap();

function silenceOfficialProvider(host, shouldSilence) {
	const sessionTitle = host.sessionTitle ?? host.get?.("sessionTitle");
	if (!sessionTitle || typeof sessionTitle.register !== "function") return void 0;
	const target = Object.getPrototypeOf(sessionTitle);
	if (typeof target?.register !== "function") return void 0;
	let state = guardRegistry.get(target);
	if (!state) {
		state = { original: target.register, activeGuards: new Set() };
		target.register = function(provider) {
			const candidate = provider;
			if (candidate && candidate.id !== SESSION_TITLE_PROVIDER_ID) {
				if ([...state.activeGuards].some((g) => g.shouldSilence())) return () => {};
			}
			return state.original.apply(this, arguments);
		};
		guardRegistry.set(target, state);
	}
	const guardHandle = { shouldSilence };
	state.activeGuards.add(guardHandle);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		state.activeGuards.delete(guardHandle);
		if (state.activeGuards.size === 0) {
			target.register = state.original;
			guardRegistry.delete(target);
		}
	};
}

export const name = "dsh-session-intent-title";
export const inject = ["sessionTitle", "llm", "loader"];

export function apply(ctx) {
	const sessionTitle = ctx.sessionTitle ?? ctx.get?.("sessionTitle");
	const llm = ctx.llm ?? ctx.get?.("llm");
	if (!sessionTitle || !llm) {
		console.warn("[dsh-session-intent-title] sessionTitle 或 llm 服务未就绪");
		return;
	}

	console.log("[dsh-session-intent-title] Plugin loaded and applying...");

	let silencing = false;
	const restoreGuard = silenceOfficialProvider(ctx, () => silencing);

	// 禁用官方默认标题生成器，由我们接管
	const loader = ctx.loader;
	if (loader && typeof loader.entries === "function") {
		for (const entry of loader.entries()) {
			if (isOfficialTarget(entry.options) && !entry.disabled) {
				entry.update?.({ disabled: true }).catch(() => {});
				entry.fiber?.dispose?.().catch(() => {});
			}
		}
	}

	const dispose = sessionTitle.register({
		id: SESSION_TITLE_PROVIDER_ID,
		automatic: "first-prompt",
		generate: (request) => {
			console.log("[dsh-session-intent-title] generate() callback triggered!");
			const firstMsg = request.messages?.[0]?.text;
			const locale = inferLocaleFromMessage(firstMsg);
			return generateIntentSessionTitle(llm, request, locale);
		}
	});

	silencing = true;

	// 兜底保障拦截：针对系统在首轮前提前打上 fallback 的情况，监听轮次结束并自动校正升级
	const activeElevations = new Set();
	const unbindEvent = ctx.on("session/event", async (session, event) => {
		if (event.type !== "turn/end") return;
		if (shouldSkipAutoTitle(session)) return;
		if (activeElevations.has(session.id)) return;

		const currentSnapshot = sessionTitle.get?.(session);
		if (!currentSnapshot) return;

		// 只有当前标题是兜底截断（fallback），且非用户手动锁定（user），才执行自动升级
		if (currentSnapshot.source?.kind !== "fallback") return;

		const events = session.snapshotEvents();
		const userMessages = [];
		for (const ev of events) {
			if (ev.type === "user/message" && ev.data?.source?.kind === "user") {
				const text = ev.data.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "";
				if (text.trim()) userMessages.push({ seq: ev.seq, text });
			}
		}

		if (userMessages.length === 0) return;
		const first = userMessages[0];

		// 从事件流中准确提取模型配置
		const headerEvent = events.findLast((e) => e.type === "request/header");
		const headerConfig = headerEvent?.data?.header?.config;
		if (!headerConfig?.provider || !headerConfig?.model) {
			console.log("[dsh-session-intent-title] No headerConfig found in events, skip elevation");
			return;
		}

		activeElevations.add(session.id);
		console.log(`[dsh-session-intent-title] Elevating session ${session.id} from fallback...`);
		try {
			const locale = inferLocaleFromMessage(first.text);
			const result = await generateIntentSessionTitle(llm, {
				session,
				messages: [first],
				route: { provider: headerConfig.provider, model: headerConfig.model }
			}, locale);

			// 再次检查确认未被用户在此期间手动改名
			const latestSnapshot = sessionTitle.get?.(session);
			if (latestSnapshot?.source?.kind === "user") return;

			console.log(`[dsh-session-intent-title] Elevated title successfully: ${result.title}`);
			session.append("session/title", {
				title: result.title,
				messageSeqs: result.messageSeqs,
				source: {
					kind: "provider",
					provider: SESSION_TITLE_PROVIDER_ID,
					model: result.model
				}
			});
		} catch (err) {
			console.warn("[dsh-session-intent-title] Elevation error:", err.message);
		} finally {
			activeElevations.delete(session.id);
		}
	});

	ctx.effect(() => () => {
		silencing = false;
		restoreGuard?.();
		dispose?.();
		unbindEvent?.();
	}, "dsh-session-intent-title");
}
