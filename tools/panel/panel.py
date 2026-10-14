#!/usr/bin/env python3
"""Панель агентов ОРБИТЫ: читает журналы Claude Code этого репозитория (~/.claude/projects)
и показывает сессии, конвейеры и агентов с токенами, а также задачи планов и их статусы.

    npm run panel            (или: python tools/panel/panel.py [--puerto 8790] [--carpeta <папка журналов>])

Перенесено из BIMASTIL_WIFI/orquesta/herramientas/panel.py: папка журналов определяется по пути
репозитория, вкладка «Задачи» читает docs/superpowers/plans/*.md и docs/superpowers/progress.json.
"""
import argparse
import collections
import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
ACTIVO_S = 120
MAX_TEXTO = 600
CHARS_TOKEN = 4
TOKENS_IMAGEN = 1600
CAMPOS = ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")
CLAVES = ("entrada", "cache_escritura", "cache_lectura", "salida")
ID_OK = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
SCRIPT_WF = re.compile(r"^(.+?)-(wf_[A-Za-z0-9_-]+)\.js$")
ETIQUETAS = re.compile(r"<([a-z][a-z0-9_-]*)>.*?</\1>", re.S)
ESTADO_WF = {"completed": "hecho", "killed": "cancelado", "cancelled": "cancelado", "aborted": "cancelado",
             "failed": "fallo", "error": "fallo", "running": "activo"}
NUMERO = re.compile(r"^\d+$")
DIGITOS = re.compile(r"\d+")
MARGEN_S = 5
ESPERA_S = 10

_cerrojo = threading.RLock()
_registros = {}
_pequenos = {}


class Registro:
    def __init__(self):
        self.offset = 0
        self.mtime = None
        self.tam = -1
        self.usos = {}
        self.sueltos = [0, 0, 0, 0]
        self.nombres = {}
        self.llamadas = collections.Counter()
        self.resultados = {}
        self.inicio = None
        self.fin = None
        self.prompt = ""
        self.titulo = ""
        self.ultimo = ""
        self.accion = ""
        self.flujos = {}
        self.rutas = {}
        self.mensajes = collections.deque(maxlen=10)
        self.ult_id = None
        self.final = False
        self.malas = 0


def numero(v):
    return v if isinstance(v, int) and v > 0 else 0


def cadena(v):
    return v if isinstance(v, str) else ""


def grupo(nombre):
    if nombre.startswith("mcp__"):
        partes = nombre.split("__")
        return "MCP " + (partes[1] if len(partes) > 1 and partes[1] else "?")
    return nombre


def recortar(texto, n=MAX_TEXTO):
    texto = texto.strip()
    return texto if len(texto) <= n else texto[:n].rstrip() + "…"


def una_linea(texto, n=240):
    return recortar(" ".join(texto.split()), n)


def limpiar(texto):
    texto = ETIQUETAS.sub("", texto).strip()
    if texto.startswith("[Workflow harness"):
        _, _, resto = texto.partition("\n")
        texto = "\n".join(l.strip() for l in resto.splitlines()).strip()
    return texto


def medir(contenido):
    if isinstance(contenido, str):
        return len(contenido), 0
    chars = imagenes = 0
    if isinstance(contenido, list):
        for b in contenido:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "image":
                imagenes += 1
            elif isinstance(b.get("text"), str):
                chars += len(b["text"])
            else:
                chars += len(json.dumps(b, ensure_ascii=False))
    return chars, imagenes


def accion(nombre, entrada):
    for k in ("description", "command", "file_path", "pattern", "url", "query", "skill", "prompt"):
        if isinstance(entrada.get(k), str) and entrada[k].strip():
            return "%s: %s" % (nombre, entrada[k])
    return nombre


def texto_final(entrada):
    for k in ("resumen", "summary", "result", "message", "texto"):
        if isinstance(entrada.get(k), str) and entrada[k].strip():
            return entrada[k]
    for v in entrada.values():
        if isinstance(v, str) and v.strip():
            return v
    return ""


def anadir_mensaje(reg, rol, hora, texto, mid=None):
    texto = recortar(texto)
    if mid and reg.ult_id == mid and reg.mensajes and reg.mensajes[-1]["rol"] == rol:
        reg.mensajes[-1]["texto"] = recortar(reg.mensajes[-1]["texto"] + "\n" + texto)
    else:
        reg.mensajes.append({"rol": rol, "hora": hora, "texto": texto})
    reg.ult_id = mid


def asistente(reg, d):
    m = d.get("message")
    if not isinstance(m, dict):
        return
    mid = m.get("id") or d.get("requestId")
    u = m.get("usage")
    if isinstance(u, dict):
        valores = [numero(u.get(c)) for c in CAMPOS]
        if mid:
            previo = reg.usos.get(mid)
            reg.usos[mid] = valores if previo is None else [max(a, b) for a, b in zip(previo, valores)]
        else:
            for i, v in enumerate(valores):
                reg.sueltos[i] += v
    contenido = m.get("content")
    textos = []
    herramienta = False
    if isinstance(contenido, str):
        textos.append(contenido)
    elif isinstance(contenido, list):
        for b in contenido:
            if not isinstance(b, dict):
                continue
            tipo = b.get("type")
            if tipo == "text" and isinstance(b.get("text"), str) and b["text"].strip():
                textos.append(b["text"])
            elif tipo in ("tool_use", "server_tool_use"):
                herramienta = True
                tid = b.get("id")
                nombre = b.get("name") if isinstance(b.get("name"), str) else "?"
                if tid and tid in reg.nombres:
                    continue
                if tid:
                    reg.nombres[tid] = nombre
                reg.llamadas[grupo(nombre)] += 1
                entrada = b.get("input") if isinstance(b.get("input"), dict) else {}
                reg.accion = una_linea(accion(nombre, entrada), 160)
                if nombre == "Workflow" and tid and isinstance(entrada.get("scriptPath"), str):
                    reg.rutas[tid] = entrada["scriptPath"]
                if nombre in ("StructuredOutput", "SubagentHandback"):
                    final = texto_final(entrada)
                    if final:
                        textos.append(final)
    if textos:
        texto = "\n".join(textos).strip()
        if texto:
            reg.ultimo = texto
            anadir_mensaje(reg, "assistant", d.get("timestamp"), texto, mid)
            if m.get("stop_reason") in ("end_turn", "stop_sequence") and not herramienta:
                reg.final = True
    if herramienta:
        reg.final = False


def usuario(reg, d):
    m = d.get("message")
    contenido = m.get("content") if isinstance(m, dict) else None
    tur = d.get("toolUseResult")
    if isinstance(tur, dict) and isinstance(tur.get("runId"), str):
        ruta = tur.get("scriptPath") if isinstance(tur.get("scriptPath"), str) else ""
        if not ruta and isinstance(contenido, list):
            ruta = next((reg.rutas[b["tool_use_id"]] for b in contenido if isinstance(b, dict) and b.get("tool_use_id") in reg.rutas), "")
        reg.flujos[tur["runId"]] = (str(tur.get("workflowName") or ""), str(tur.get("summary") or ""), ruta)
    textos = []
    if isinstance(contenido, str):
        textos.append(contenido)
    elif isinstance(contenido, list):
        resultado = False
        for b in contenido:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_result":
                resultado = True
                nombre = reg.nombres.get(b.get("tool_use_id"), "?")
                chars, imagenes = medir(b.get("content"))
                r = reg.resultados.setdefault(grupo(nombre), [0, 0, 0])
                r[0] += chars
                r[1] += imagenes
                r[2] += 1
                reg.final = nombre == "StructuredOutput" and not b.get("is_error")
            elif b.get("type") == "text" and isinstance(b.get("text"), str):
                textos.append(b["text"])
        if resultado:
            return
    if d.get("isMeta"):
        return
    texto = limpiar("\n".join(textos))
    if not texto:
        return
    reg.final = False
    if not reg.prompt:
        reg.prompt = una_linea(texto, 200)
    anadir_mensaje(reg, "user", d.get("timestamp"), texto)


def procesar(reg, d):
    if not isinstance(d, dict):
        reg.malas += 1
        return
    hora = d.get("timestamp")
    if isinstance(hora, str) and hora:
        if reg.inicio is None or hora < reg.inicio:
            reg.inicio = hora
        if reg.fin is None or hora > reg.fin:
            reg.fin = hora
    tipo = d.get("type")
    if tipo == "assistant":
        asistente(reg, d)
    elif tipo == "user":
        usuario(reg, d)
    elif tipo == "ai-title" and isinstance(d.get("aiTitle"), str):
        reg.titulo = d["aiTitle"]


def cargar(linea):
    try:
        return json.loads(linea.decode("utf-8", "replace"))
    except (ValueError, RecursionError):
        return None


def leer(ruta):
    try:
        st = os.stat(ruta)
    except OSError:
        return None
    with _cerrojo:
        reg = _registros.get(ruta)
        if reg is not None and reg.mtime == st.st_mtime_ns and reg.tam == st.st_size:
            return reg
        if reg is None or st.st_size < reg.offset:
            reg = Registro()
        try:
            with open(ruta, "rb") as f:
                f.seek(reg.offset)
                for linea in f:
                    completa = linea.endswith(b"\n")
                    if not linea.strip():
                        if completa:
                            reg.offset += len(linea)
                        continue
                    d = cargar(linea)
                    if d is None and not completa:
                        break
                    reg.offset += len(linea)
                    if d is None:
                        reg.malas += 1
                        continue
                    try:
                        procesar(reg, d)
                    except Exception:
                        reg.malas += 1
        except OSError:
            pass
        reg.mtime = st.st_mtime_ns
        reg.tam = st.st_size
        _registros[ruta] = reg
        return reg


def lineas_json(ruta):
    try:
        with open(ruta, "rb") as f:
            for linea in f:
                if linea.strip():
                    d = cargar(linea)
                    if isinstance(d, dict):
                        yield d
    except OSError:
        return


def leer_pequeno(ruta, funcion):
    try:
        st = os.stat(ruta)
    except OSError:
        return None
    clave = (ruta, funcion.__name__)
    with _cerrojo:
        previo = _pequenos.get(clave)
        if previo and previo[0] == st.st_mtime_ns and previo[1] == st.st_size:
            return previo[2]
        try:
            valor = funcion(ruta)
        except Exception:
            valor = None
        _pequenos[clave] = (st.st_mtime_ns, st.st_size, valor)
        return valor


def leer_journal(ruta):
    agentes = {}
    for d in lineas_json(ruta):
        aid = d.get("agentId")
        if not isinstance(aid, str) or not aid:
            continue
        a = agentes.setdefault(aid, {"etiqueta": "", "fase": "", "resultado": False, "fallo": False,
                                     "bloqueado": False, "n": len(agentes)})
        tipo = d.get("type")
        if tipo == "started":
            a["etiqueta"] = cadena(d.get("label")) or a["etiqueta"]
            a["fase"] = cadena(d.get("phase")) or a["fase"]
        elif tipo == "result":
            a["resultado"] = True
            r = d.get("result")
            a["bloqueado"] = isinstance(r, dict) and r.get("estado") == "bloqueado"
        elif tipo == "failed":
            a["fallo"] = True
    return agentes


def leer_objeto(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as f:
        d = json.load(f)
    return d if isinstance(d, dict) else None


def meta_script(texto):
    cabeza = texto[:4000] if isinstance(texto, str) else ""
    res = {}
    for k in ("name", "description"):
        m = re.search(r"\b" + k + r"\s*:\s*(['\"`])(.*?)\1", cabeza, re.S)
        res[k] = m.group(2).strip() if m else ""
    return res


def bloqueados_de(resultado):
    ordenes = resultado.get("ordenes") if isinstance(resultado, dict) else None
    if not isinstance(ordenes, list):
        return []
    return [str(o.get("id") or "?") for o in ordenes if isinstance(o, dict) and o.get("estado") == "bloqueado"]


def leer_resumen(ruta):
    d = leer_objeto(ruta) or {}
    res = {k: d.get(k) for k in ("durationMs", "startTime", "agentCount", "totalTokens")}
    res.update({k: cadena(d.get(k)) for k in ("workflowName", "status", "summary", "scriptPath")})
    res["nombre_script"] = meta_script(d.get("script"))["name"]
    res["bloqueados"] = bloqueados_de(d.get("result"))
    return res


def leer_meta_script(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as f:
        return meta_script(f.read(4000))


def meta_de(ruta):
    if not isinstance(ruta, str) or not ruta.lower().endswith(".js") or not os.path.isfile(ruta):
        return {}
    return leer_pequeno(ruta, leer_meta_script) or {}


def mtime(ruta):
    try:
        return os.stat(ruta).st_mtime
    except OSError:
        return None


def listar(carpeta):
    try:
        return sorted(os.listdir(carpeta))
    except OSError:
        return []


def segundos(hora):
    try:
        return datetime.fromisoformat(hora.replace("Z", "+00:00")).timestamp()
    except (AttributeError, TypeError, ValueError):
        return None


def duracion(a, b):
    x, y = segundos(a), segundos(b)
    return round(y - x) if x is not None and y is not None and y >= x else 0


def minimo(valores):
    v = [x for x in valores if x]
    return min(v) if v else None


def maximo(valores):
    v = [x for x in valores if x]
    return max(v) if v else None


def tokens_de(reg):
    s = list(reg.sueltos)
    for v in reg.usos.values():
        for i in range(4):
            s[i] += v[i]
    t = dict(zip(CLAVES, s))
    t["total"] = sum(s)
    return t


def sumar_tokens(lista):
    t = dict.fromkeys(CLAVES + ("total",), 0)
    for x in lista:
        for k in t:
            t[k] += x.get(k, 0)
    return t


def carpetas(base):
    base = os.path.normpath(base)
    padre, nombre = os.path.split(base)
    res = [base]
    for e in listar(padre):
        r = os.path.join(padre, e)
        if e.lower().startswith(nombre.lower() + "-") and os.path.isdir(r):
            res.append(r)
    return res


def ficheros_sesion(base):
    sesiones = {}
    for c in carpetas(base):
        for e in listar(c):
            if e.endswith(".jsonl") and ID_OK.match(e[:-6]) and os.path.isfile(os.path.join(c, e)):
                sesiones.setdefault(e[:-6], os.path.join(c, e))
    return sesiones


def nodo(ruta, ahora):
    reg = (leer(ruta) if ruta else None) or Registro()
    mt = mtime(ruta) if ruta else None
    return reg, {
        "tokens": tokens_de(reg),
        "inicio": reg.inicio,
        "fin": reg.fin,
        "duracion_s": duracion(reg.inicio, reg.fin),
        "llamadas": sum(reg.llamadas.values()),
        "herramientas": dict(reg.llamadas),
        "ultimo_texto": una_linea(reg.ultimo),
        "ultima_accion": reg.accion,
        "mensajes": list(reg.mensajes),
        "reciente": mt is not None and ahora - mt < ACTIVO_S,
        "mtime": round(mt) if mt else None,
        "malas": reg.malas,
    }


def estado_agente(n, jr, final):
    if jr and jr["resultado"]:
        return "hecho"
    if jr and jr["fallo"]:
        return "fallo"
    if final:
        return "hecho"
    return "activo" if n["reciente"] else "parado"


def agente(ruta, aid, meta, jr, ahora, regs):
    reg, n = nodo(ruta, ahora)
    regs.append(reg)
    meta = meta or {}
    jr_ = jr or {}
    n["id"] = aid
    n["etiqueta"] = cadena(meta.get("description")) or cadena(jr_.get("etiqueta")) or aid
    n["fase"] = cadena(meta.get("workflowPhase")) or cadena(jr_.get("fase"))
    n["tipo"] = cadena(meta.get("agentType"))
    n["estado"] = estado_agente(n, jr, reg.final)
    n["bloqueado"] = bool(jr and jr.get("bloqueado"))
    n["n"] = (jr or {}).get("n", 0)
    return n


def buscar_workflows(dirs):
    wfs = {}
    for d in dirs:
        sub = os.path.join(d, "subagents", "workflows")
        for e in listar(sub):
            if os.path.isdir(os.path.join(sub, e)):
                wfs.setdefault(e, {}).setdefault("carpeta", os.path.join(sub, e))
        for e in listar(os.path.join(d, "workflows")):
            if e.startswith("wf_") and e.endswith(".json"):
                wfs.setdefault(e[:-5], {}).setdefault("resumen", os.path.join(d, "workflows", e))
        for e in listar(os.path.join(d, "workflows", "scripts")):
            m = SCRIPT_WF.match(e)
            if m:
                w = wfs.setdefault(m.group(2), {})
                w.setdefault("script", os.path.join(d, "workflows", "scripts", e))
                w.setdefault("nombre", m.group(1))
    return wfs


def trozos(etiqueta):
    t = [p.strip().lower() for p in str(etiqueta or "").split(":")]
    return t[0].split("-") if len(t) == 1 else t


def partes(etiqueta):
    return [p for p in trozos(etiqueta) if p and not NUMERO.match(p)]


def forma(etiqueta):
    return [x for x in (DIGITOS.sub("", p) for p in trozos(etiqueta)) if x]


def claves(agentes):
    toks = {a["id"]: partes(a["etiqueta"]) for a in agentes}
    fases = collections.defaultdict(set)
    for a in agentes:
        for i, t in enumerate(toks[a["id"]]):
            fases[(i, t)].add(a["fase"])
    mejor, puntos = None, 0
    for i in range(max((len(t) for t in toks.values()), default=0)):
        p = sum(1 for t in toks.values() if len(t) > 1 and i < len(t) and len(fases[(i, t[i])]) > 1)
        if p > puntos:
            mejor, puntos = i, p
    if mejor is None:
        return {}
    return {aid: t[mejor] for aid, t in toks.items() if len(t) > 1 and mejor < len(t)}


def columnas(orden, ini, fin):
    primero, cols, colfase = {}, [], {}
    for a in orden:
        primero.setdefault(a["fase"], ini[a["id"]])
    for f, t in primero.items():
        if cols:
            n = len(cols) - 1
            libre = not any(a["id"] in fin and fin[a["id"]] <= t for a in orden if colfase.get(a["fase"]) == n)
            if libre and t - primero[cols[n][0]] <= MARGEN_S:
                cols[n].append(f)
                colfase[f] = n
                continue
        colfase[f] = len(cols)
        cols.append([f])
    return [" + ".join(c) for c in cols], colfase


def rejilla(agentes):
    pos = {a["id"]: {"col": i % 4, "y": i // 4} for i, a in enumerate(agentes)}
    return {"fases": [""] * min(4, len(agentes)), "filas": (len(agentes) + 3) // 4, "pos": pos, "aristas": [], "claves": {}}


def grafo(agentes, ahora):
    orden = sorted(agentes, key=lambda a: (segundos(a["inicio"]) or ahora, a.get("n", 0)))
    ini = {a["id"]: segundos(a["inicio"]) or ahora for a in orden}
    fin = {a["id"]: segundos(a["fin"]) for a in orden if a["estado"] != "activo" and segundos(a["fin"])}
    fases, colfase = columnas(orden, ini, fin)
    col = {a["id"]: colfase[a["fase"]] for a in orden}
    clave = claves(orden)
    fm = {a["id"]: forma(a["etiqueta"]) for a in orden}

    def acabado(b, x):
        return b in fin and fin[b] <= ini[x] + MARGEN_S

    def enlazable(b, x):
        return col[b] != col[x] or fm[b] == fm[x]

    aristas, previo, hojas, vistos = [], {}, [], []
    for a in orden:
        x = a["id"]
        k = clave.get(x)
        mismos = [b for b in vistos if k is not None and clave.get(b) == k and enlazable(b, x)]
        hechos = [b for b in mismos if acabado(b, x)]
        antes = [b for b in mismos if col[b] < col[x]]
        p = max(hechos, key=lambda b: fin[b]) if hechos else (antes[-1] if antes else None)
        if p is not None:
            aristas.append({"de": p, "a": x, "tipo": "vuelta" if col[x] <= col[p] else "paso"})
            previo[x] = p
            if p in hojas:
                hojas.remove(p)
        else:
            listos = [b for b in hojas if acabado(b, x)]
            if listos and ini[x] - max(fin[b] for b in listos) <= ESPERA_S:
                for b in listos:
                    aristas.append({"de": b, "a": x, "tipo": "espera"})
                    hojas.remove(b)
        hojas.append(x)
        vistos.append(x)

    carriles, celda, ocupado = {}, {}, set()
    for a in orden:
        x = a["id"]
        if x not in clave:
            continue
        c = carriles.setdefault(clave[x], len(carriles))
        p = previo.get(x)
        r = 0 if p is None else celda[p][1] + (1 if col[x] <= col[p] else 0)
        while (c, col[x], r) in ocupado:
            r += 1
        celda[x] = (c, r)
        ocupado.add((c, col[x], r))
    altura = collections.Counter()
    for c, r in celda.values():
        altura[c] = max(altura[c], r + 1)
    for a in orden:
        x = a["id"]
        if x in celda:
            continue
        sitio = next(((c, r) for c in range(len(carriles)) for r in range(altura[c]) if (c, col[x], r) not in ocupado), None)
        if sitio is None:
            sitio = (len(carriles), 0)
            carriles[("", x)] = sitio[0]
            altura[sitio[0]] = 1
        celda[x] = sitio
        ocupado.add((sitio[0], col[x], sitio[1]))
    inicio_carril, total = {}, 0
    for c in range(len(carriles)):
        inicio_carril[c] = total
        total += altura[c] or 1
    por_col = collections.Counter(col.values())
    pos = {}
    for a in orden:
        x = a["id"]
        c, r = celda[x]
        y = inicio_carril[c] + r
        if x not in clave and por_col[col[x]] == 1:
            y = (total - 1) / 2
        pos[x] = {"col": col[x], "y": y}
    return {"fases": fases, "filas": total, "pos": pos, "aristas": aristas, "claves": clave}


def workflow(wid, info, ahora, regs, flujos):
    carpeta = info.get("carpeta")
    jr = (leer_pequeno(os.path.join(carpeta, "journal.jsonl"), leer_journal) if carpeta else None) or {}
    res = (leer_pequeno(info["resumen"], leer_resumen) if info.get("resumen") else None) or {}
    ids = []
    if carpeta:
        for e in listar(carpeta):
            if e.startswith("agent-") and e.endswith(".jsonl"):
                ids.append(e[6:-6])
    ids += [a for a in jr if a not in ids]
    mj = mtime(os.path.join(carpeta, "journal.jsonl")) if carpeta else None
    journal_reciente = mj is not None and ahora - mj < ACTIVO_S
    agentes = []
    for aid in ids:
        ruta = os.path.join(carpeta, "agent-%s.jsonl" % aid)
        if not os.path.isfile(ruta):
            ruta = None
        meta = leer_pequeno(os.path.join(carpeta, "agent-%s.meta.json" % aid), leer_objeto)
        n = agente(ruta, aid, meta, jr.get(aid), ahora, regs)
        if ruta is None and n["estado"] == "parado" and journal_reciente:
            n["estado"] = "activo"
        agentes.append(n)
    agentes.sort(key=lambda a: a["inicio"] or "9999")
    estado = ESTADO_WF.get(res.get("status"))
    if not estado:
        estado = "activo" if journal_reciente or any(a["estado"] == "activo" for a in agentes) else "parado"
    inicio = minimo(a["inicio"] for a in agentes)
    if isinstance(res.get("startTime"), (int, float)):
        inicio = datetime.fromtimestamp(res["startTime"] / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    fin = maximo(a["fin"] for a in agentes)
    dur = res.get("durationMs")
    try:
        g = grafo(agentes, ahora)
    except Exception:
        g = rejilla(agentes)
    lanzado = flujos.get(wid, ("", "", ""))
    meta = meta_de(info.get("script")) or meta_de(lanzado[2]) or meta_de(res.get("scriptPath"))
    descripcion = res.get("summary") or lanzado[1] or meta.get("description") or ""
    nombre = res.get("workflowName") or info.get("nombre") or lanzado[0] or meta.get("name") or res.get("nombre_script")
    return {
        "id": wid,
        "nombre": nombre or wid,
        "descripcion": una_linea(descripcion),
        "estado": estado,
        "bloqueados": res.get("bloqueados") or [],
        "grafo": g,
        "inicio": inicio,
        "fin": fin,
        "duracion_s": round(dur / 1000) if isinstance(dur, (int, float)) else duracion(inicio, fin),
        "tokens": sumar_tokens(a["tokens"] for a in agentes),
        "llamadas": sum(a["llamadas"] for a in agentes),
        "agentes": agentes,
    }


def herramientas(regs):
    llamadas = collections.Counter()
    resultados = {}
    for reg in regs:
        llamadas.update(reg.llamadas)
        for g, (c, i, n) in reg.resultados.items():
            r = resultados.setdefault(g, [0, 0, 0])
            r[0] += c
            r[1] += i
            r[2] += n
    lista = []
    for g in set(llamadas) | set(resultados):
        c, i, _ = resultados.get(g, [0, 0, 0])
        lista.append({"nombre": g, "llamadas": llamadas.get(g, 0), "caracteres": c, "imagenes": i,
                      "tokens_aprox": c // CHARS_TOKEN + i * TOKENS_IMAGEN})
    total = sum(x["tokens_aprox"] for x in lista) or 1
    for x in lista:
        x["cuota"] = round(x["tokens_aprox"] / total, 4)
    lista.sort(key=lambda x: (-x["tokens_aprox"], -x["llamadas"], x["nombre"]))
    return lista


def sesion(base, sid, ahora=None):
    if not ID_OK.match(sid or ""):
        return None
    with _cerrojo:
        return _sesion(base, sid, ahora or time.time())


def _sesion(base, sid, ahora):
    ruta = ficheros_sesion(base).get(sid)
    if not ruta:
        return None
    regs = []
    reg, chat = nodo(ruta, ahora)
    regs.append(reg)
    chat["id"] = "chat"
    chat["estado"] = "activo" if chat["reciente"] else ("espera" if reg.final else "parado")
    dirs = [os.path.join(c, sid) for c in carpetas(base) if os.path.isdir(os.path.join(c, sid))]
    wfs = [workflow(w, info, ahora, regs, reg.flujos) for w, info in buscar_workflows(dirs).items()]
    wfs.sort(key=lambda w: w["inicio"] or "9999")
    sueltos = []
    for d in dirs:
        sub = os.path.join(d, "subagents")
        for e in listar(sub):
            if e.startswith("agent-") and e.endswith(".jsonl"):
                aid = e[6:-6]
                meta = leer_pequeno(os.path.join(sub, "agent-%s.meta.json" % aid), leer_objeto)
                sueltos.append(agente(os.path.join(sub, e), aid, meta, None, ahora, regs))
    sueltos.sort(key=lambda a: a["inicio"] or "9999")
    todos = [chat] + [a for w in wfs for a in w["agentes"]] + sueltos
    inicio = minimo(n["inicio"] for n in todos)
    fin = maximo(n["fin"] for n in todos)
    return {
        "id": sid,
        "titulo": reg.titulo,
        "prompt": reg.prompt,
        "inicio": inicio,
        "fin": fin,
        "duracion_s": duracion(inicio, fin),
        "activa": any(n["estado"] == "activo" for n in todos) or any(w["estado"] == "activo" for w in wfs),
        "chat": chat,
        "workflows": wfs,
        "agentes": sueltos,
        "totales": {
            "tokens": sumar_tokens(n["tokens"] for n in todos),
            "agentes": len(todos) - 1,
            "workflows": len(wfs),
            "malas": sum(n["malas"] for n in todos),
        },
        "herramientas": herramientas(regs),
    }


def listar_sesiones(base, ahora=None):
    ahora = ahora or time.time()
    lista = []
    for sid in ficheros_sesion(base):
        try:
            s = sesion(base, sid, ahora)
        except Exception:
            s = None
        if not s:
            continue
        lista.append({
            "id": sid,
            "inicio": s["inicio"],
            "fin": s["fin"],
            "titulo": s["titulo"],
            "prompt": s["prompt"],
            "activa": s["activa"],
            "tokens": s["totales"]["tokens"],
            "tokens_chat": s["chat"]["tokens"],
            "agentes": s["totales"]["agentes"],
            "workflows": s["totales"]["workflows"],
        })
    lista.sort(key=lambda s: s["fin"] or "", reverse=True)
    return lista


VENTANA_S = 5 * 3600
_cuota = {}


def epoca(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def leer_cuota(ruta):
    """Uso por mensaje (ts, todo, sin_lectura, salida) y rechazos (ts, resetsAt) de un .jsonl, incremental."""
    try:
        st = os.stat(ruta)
    except OSError:
        return None
    c = _cuota.get(ruta)
    if c and c["tam"] == st.st_size and c["mtime"] == st.st_mtime_ns:
        return c
    if not c or st.st_size < c["offset"]:
        c = {"offset": 0, "usos": {}, "rechazos": []}
    try:
        with open(ruta, "rb") as f:
            f.seek(c["offset"])
            for linea in f:
                if not linea.endswith(b"\n"):
                    break
                c["offset"] += len(linea)
                if b'"usage"' not in linea and b"quotaLimits" not in linea:
                    continue
                d = cargar(linea)
                if not isinstance(d, dict):
                    continue
                ts = epoca(d.get("timestamp"))
                if ts is None:
                    continue
                q = d.get("quotaLimits")
                if isinstance(q, dict) and q.get("status") == "rejected" and numero(q.get("resetsAt")):
                    c["rechazos"].append((ts, float(q["resetsAt"])))
                    continue
                m = d.get("message")
                u = m.get("usage") if isinstance(m, dict) else None
                if d.get("type") != "assistant" or not isinstance(u, dict):
                    continue
                ent, esc_, lec, sal = (numero(u.get(k)) for k in CAMPOS)
                clave = m.get("id") or d.get("uuid") or str(c["offset"])
                c["usos"][clave] = (ts, ent + esc_ + lec + sal, ent + esc_ + sal, sal)
    except OSError:
        pass
    c["tam"], c["mtime"] = st.st_size, st.st_mtime_ns
    _cuota[ruta] = c
    return c


def limite(base):
    usos, rechazos = [], []
    for raiz, _, ficheros in os.walk(base):
        for n in ficheros:
            if n.endswith(".jsonl"):
                c = leer_cuota(os.path.join(raiz, n))
                if c:
                    usos.extend(c["usos"].values())
                    rechazos.extend(c["rechazos"])
    if not rechazos:
        return {"conocido": False}

    def suma(a, b):
        s = [0, 0, 0]
        for u in usos:
            if a <= u[0] < b:
                s[0] += u[1]; s[1] += u[2]; s[2] += u[3]
        return dict(zip(("todo", "sin_lectura", "salida"), s))

    rechazos.sort()
    ultimo = max(r for _, r in rechazos)
    primer_rechazo = min(ts for ts, r in rechazos if r == ultimo)
    previa = suma(ultimo - VENTANA_S, primer_rechazo)
    ahora = time.time()
    if ahora < ultimo:
        return {"conocido": True, "agotado": True, "reinicio": ultimo, "previa": previa}
    posteriores = [u[0] for u in usos if u[0] >= ultimo]
    inicio = min(posteriores) if posteriores else ahora
    actual = suma(inicio, ahora + 1)
    return {"conocido": True, "agotado": False, "inicio": inicio, "reinicio": inicio + VENTANA_S,
            "actual": actual, "previa": previa,
            "porcentaje": {k: (round(100 * actual[k] / previa[k]) if previa[k] else None) for k in actual}}


RAIZ = os.path.normpath(os.path.join(AQUI, "..", ".."))
PLANES = os.path.join(RAIZ, "docs", "superpowers", "plans")
PROGRESO = os.path.join(RAIZ, "docs", "superpowers", "progress.json")
TAREA_MD = re.compile(r"^### Task (\d+): (.+?)\s*$", re.M)
ESTADO_TAREA = {
    "done": ("готово", "hecho"),
    "active": ("пишется", "activo"),
    "review": ("на проверке", "activo"),
    "fix": ("исправляется", "espera"),
    "blocked": ("остановлено", "fallo"),
    "todo": ("ещё не начато", "espera"),
}


def leer_plan(ruta):
    with open(ruta, encoding="utf-8", errors="replace") as f:
        texto = f.read()
    titulo = re.search(r"^# (.+)$", texto, re.M)
    return {"titulo": titulo.group(1).strip() if titulo else os.path.basename(ruta),
            "tareas": [(m.group(1), m.group(2)) for m in TAREA_MD.finditer(texto)]}


def tareas():
    """Задачи из планов docs/superpowers/plans/*.md; статусы — из progress.json (его ведёт оркестратор)."""
    try:
        prog = leer_objeto(PROGRESO) or {}
    except (OSError, ValueError):
        prog = {}
    grupos = []
    for nombre in listar(PLANES):
        if not nombre.endswith(".md"):
            continue
        plan = leer_pequeno(os.path.join(PLANES, nombre), leer_plan)
        if not plan or not plan["tareas"]:
            continue
        estados = prog.get(nombre[:-3])
        estados = estados if isinstance(estados, dict) else {}
        filas = []
        for num, titulo in plan["tareas"]:
            e = estados.get(num) if isinstance(estados.get(num), dict) else {}
            estado, clase = ESTADO_TAREA.get(e.get("status"), ESTADO_TAREA["todo"])
            filas.append({"id": num, "nombre": "%s. %s" % (num, titulo), "que": cadena(e.get("note")),
                          "estado": estado, "clase": clase, "motivo": cadena(e.get("reason"))})
        hechas = sum(1 for f in filas if f["clase"] == "hecho")
        grupos.append({"nombre": "%s — готово %d из %d" % (plan["titulo"], hechas, len(filas)), "tareas": filas})
    return {"grupos": grupos}


def carpeta_proyecto():
    """Папка журналов Claude Code для этого репозитория: его путь, где всё кроме латиницы и цифр заменено на «-»."""
    nombre = re.sub(r"[^A-Za-z0-9]", "-", RAIZ)
    base = os.path.join(os.path.expanduser("~"), ".claude", "projects")
    for e in listar(base):
        if e.lower() == nombre.lower():
            return os.path.join(base, e)
    return os.path.join(base, nombre)


CARPETA = carpeta_proyecto()


class Manejador(BaseHTTPRequestHandler):
    base = CARPETA

    def log_message(self, *args):
        pass

    def enviar(self, codigo, cuerpo, tipo="application/json; charset=utf-8"):
        if not isinstance(cuerpo, bytes):
            cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def host_valido(self):
        puerto = self.server.server_address[1]
        host = (self.headers.get("Host") or "").strip().lower()
        return host in ("127.0.0.1:%d" % puerto, "localhost:%d" % puerto)

    def do_GET(self):
        ruta = urlparse(self.path).path
        try:
            if not self.host_valido():
                self.enviar(403, {"error": "host no permitido"})
            elif ruta in ("/", "/index.html"):
                with open(os.path.join(AQUI, "panel.html"), "rb") as f:
                    self.enviar(200, f.read(), "text/html; charset=utf-8")
            elif ruta == "/api/limite":
                with _cerrojo:
                    self.enviar(200, limite(self.base))
            elif ruta == "/api/tareas":
                self.enviar(200, tareas())
            elif ruta == "/api/sesiones":
                self.enviar(200, listar_sesiones(self.base))
            elif ruta.startswith("/api/sesion/"):
                s = sesion(self.base, unquote(ruta[len("/api/sesion/"):]))
                self.enviar(200, s) if s else self.enviar(404, {"error": "sesion desconocida"})
            else:
                self.enviar(404, {"error": "no existe"})
        except ConnectionError:
            pass
        except Exception as e:
            try:
                self.enviar(500, {"error": type(e).__name__})
            except OSError:
                pass


class Servidor(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], ConnectionError):
            return
        super().handle_error(request, client_address)


def servidor(base, puerto):
    manejador = type("ManejadorPanel", (Manejador,), {"base": base})
    return Servidor(("127.0.0.1", puerto), manejador)


def main():
    ap = argparse.ArgumentParser(description="Панель агентов ОРБИТЫ")
    ap.add_argument("--puerto", type=int, default=8790)
    ap.add_argument("--carpeta", default=CARPETA)
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # консоль Windows не всегда умеет кириллицу
    except (AttributeError, ValueError):
        pass
    srv = servidor(a.carpeta, a.puerto)
    threading.Thread(target=listar_sesiones, args=(a.carpeta,), daemon=True).start()
    print("Журналы: %s" % a.carpeta, flush=True)
    if not os.path.isdir(a.carpeta):
        print("Папки пока нет: она появится после первой сессии Claude Code в этом репозитории.", flush=True)
    print("Панель: http://127.0.0.1:%d  (Ctrl+C — остановить)" % srv.server_address[1], flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    srv.server_close()


if __name__ == "__main__":
    main()
