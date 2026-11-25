# Yuhao Liu - A01787782
import csv
import sys
from collections import deque

import flask
import numpy

app = flask.Flask(__name__)
MARGEN = 2
TIPOS = ["ZZ", "A", "S"]


# arma el cuarto con obstaculos al azar y saca a, s y p como en el tablero
def crearCuarto(M, N, pctObstaculos, estaciones, rng):
    A = numpy.ones((M, N))
    libres = [k for k in rng.permutation(M * N) if k not in estaciones]
    for k in libres[:round(pctObstaculos * M * N)]:
        A[numpy.unravel_index(k, A.shape)] = 0
    S = numpy.zeros((A.size, A.size))
    for m in range(M):
        for n in range(N):
            for x in [-1, 0, 1]:
                for y in [-1, 0, 1]:
                    if ((x != 0 or y != 0) and 0 <= m + x < M and 0 <= n + y < N
                            and A[m, n] == 1 and A[m + x, n + y] == 1):
                        S[numpy.ravel_multi_index([m, n], A.shape),
                          numpy.ravel_multi_index([m + x, n + y], A.shape)] = 1
    P = S.copy()
    for i in range(S.shape[0]):
        if numpy.sum(S[i, :]) > 0:
            P[i, :] /= numpy.sum(S[i, :])
    return A, S, P


# busca con bfs el camino mas corto a la meta mas cercana (none si no hay)
def rutaCorta(S, origen, metas):
    padre = {origen: origen}
    cola = deque([origen])
    encontrado = origen if origen in metas else None
    while cola and encontrado is None:
        actual = cola.popleft()
        for vecino in numpy.where(S[actual, :] != 0)[0]:
            vecino = int(vecino)
            if encontrado is None and vecino not in padre:
                padre[vecino] = actual
                cola.append(vecino)
                encontrado = vecino if vecino in metas else None
    ruta = None
    if encontrado is not None:
        ruta = []
        while encontrado != origen:
            ruta.insert(0, encontrado)
            encontrado = padre[encontrado]
    return ruta


# revisa que cada paso de la ruta este en s, como en el tablero
def rutaValida(S, ruta):
    return all(a == b or S[a, b] != 0 for a, b in zip(ruta, ruta[1:]))


# orden en espiral: se va quitando cada orilla de la matriz
def ordenEspiral(A):
    B = numpy.arange(A.size).reshape(A.shape)
    camino = []
    while B.size > 0:
        camino.append(B[0, :])
        B = numpy.delete(B, 0, axis=0)
        if B.size > 0:
            camino.append(B[:, -1])
            B = numpy.delete(B, -1, axis=1)
        if B.size > 0:
            camino.append(numpy.flip(B[-1, :]))
            B = numpy.delete(B, -1, axis=0)
        if B.size > 0:
            camino.append(numpy.flip(B[:, 0]))
            B = numpy.delete(B, 0, axis=1)
    return [int(k) for k in numpy.concatenate(camino) if A.flat[k] == 1]


# distancia en celdas entre dos estados, contando diagonales
def distancia(a, b, forma):
    i, j = numpy.unravel_index(a, forma)
    k, m = numpy.unravel_index(b, forma)
    return max(abs(int(i) - int(k)), abs(int(j) - int(m)))


# subsuncion: la primera capa que aplica decide a donde va el agente
def decidir(agente, S, P, sucias, estaciones, rng):
    pos = agente["pos"]
    orden = agente["orden"]
    casa = rutaCorta(S, pos, agente["estaciones"])
    vecinos = [int(v) for v in numpy.where(S[pos, :] != 0)[0]]
    siguiente = pos
    if pos not in sucias:
        agente["basura"].discard(pos)
    # los demas avisan a donde van, para no ir al mismo lugar
    agente["objetivos"].pop(agente["num"], None)
    otros = list(agente["objetivos"].values())
    basura = agente["basura"] - set(otros)
    # capa 1: carga hasta llenarse
    if pos in estaciones and (agente["cargando"] or agente["bateria"] <= MARGEN
                              or (agente["volviendo"] and pos in agente["estaciones"])):
        agente["cargando"] = agente["bateria"] < 100
        agente["volviendo"] = agente["cargando"]
    if agente["cargando"]:
        siguiente = pos
    # capa 2: si la pila apenas alcanza, regresa a la estacion
    elif casa and (agente["volviendo"] or agente["bateria"] <= len(casa) + MARGEN):
        agente["volviendo"] = True
        siguiente = casa[0]
    # capa 3: si esta sucio, limpia
    elif pos in sucias:
        siguiente = pos
    # capa 4: va a la basura que ya vio
    elif basura:
        camino = rutaCorta(S, pos, basura)
        siguiente = camino[0] if camino else pos
        agente["objetivos"][agente["num"]] = camino[-1] if camino else pos
    # capa 5: explora (zz zigzag, a aleatoria, s espiral)
    elif agente["tipo"] == "A" and len(agente["visitadas"]) < len(orden):
        siguiente = int(rng.choice(len(P), p=P[pos, :])) if vecinos else pos
    elif agente["tipo"] in ("ZZ", "S"):
        faltan = [k for k in orden if k not in agente["visitadas"]]
        lejos = [k for k in faltan if all(distancia(k, o, agente["forma"]) > 2 for o in otros)]
        metas = (lejos or faltan)[:1]
        agente["objetivos"].update({agente["num"]: metas[0]} if metas else {})
        camino = rutaCorta(S, pos, set(metas)) if metas else None
        if camino:
            siguiente = camino[0]
        else:
            agente["visitadas"].update(metas[:1])
    # capa 6: si no hay nada que hacer, regresa y espera
    if siguiente == pos and pos not in sucias and casa and not agente["volviendo"]:
        if not agente["basura"] and len(agente["visitadas"]) >= len(orden):
            agente["volviendo"] = True
            siguiente = casa[0]
    return siguiente


# corre una simulacion y regresa el cuarto, los agentes y los datos
def simular(M, N, nAgentes, pctSucio, pctObstaculos, tMax, tipo, semilla=None):
    rng = numpy.random.default_rng(semilla)
    # sim 1: un agente empieza en [1,1]; sim 2: todos en [0,0] (ahi esta la estacion)
    estacion = int(numpy.ravel_multi_index([1, 1], (M, N))) if nAgentes == 1 else 0
    inicios = [estacion] * nAgentes
    A, S, P = crearCuarto(M, N, pctObstaculos, inicios, rng)
    libres = [k for k in rng.permutation(M * N) if A.flat[k] == 1 and k not in inicios]
    sucias = set(int(k) for k in libres[:round(pctSucio * len(libres))])
    suciasIniciales = set(sucias)
    limpiadas = {}
    estaciones = set(inicios)
    orden = [numpy.ravel_multi_index([i, j if i % 2 == 0 else N - 1 - j], A.shape)
             for i in range(M) for j in range(N)]
    orden = [int(k) for k in orden if A.flat[k] == 1]
    if tipo == "S":
        orden = ordenEspiral(A)
    # el recorrido se parte en tramos: cada agente hace primero el suyo y luego ayuda
    cortes = numpy.linspace(0, len(orden), nAgentes + 1).astype(int)
    visitadas = set(inicios)
    objetivos = {}
    agentes = []
    for numero, k in enumerate(inicios):
        zona = orden[cortes[numero]:cortes[numero + 1]]
        agentes.append({"num": numero + 1, "pos": k, "tipo": tipo, "bateria": 100,
                        "volviendo": False, "cargando": False, "estaciones": {k},
                        "visitadas": visitadas, "objetivos": objetivos, "forma": A.shape,
                        "basura": set(), "ruta": [k], "baterias": [100],
                        "movimientos": 0, "limpiezas": 0, "ultimaLimpieza": 0,
                        "orden": zona + [c for c in orden if c not in zona]})
    tiempo = 0
    while sucias and tiempo < tMax:
        tiempo += 1
        for agente in agentes:
            pos = agente["pos"]
            siguiente = decidir(agente, S, P, sucias, estaciones, rng)
            if siguiente != pos:
                agente["movimientos"] += 1
                agente["bateria"] -= 1
            elif pos in sucias:
                sucias.discard(pos)
                limpiadas[pos] = tiempo
                agente["limpiezas"] += 1
                agente["ultimaLimpieza"] = tiempo
                agente["bateria"] -= 1
            elif pos in estaciones:
                agente["bateria"] = min(100, agente["bateria"] + 5)
            agente["pos"] = siguiente
            agente["visitadas"].add(siguiente)
            # ve la basura de su celda y sus 8 vecinas
            alrededor = [siguiente] + [int(v) for v in numpy.where(S[siguiente, :] != 0)[0]]
            agente["basura"] = (agente["basura"] | (set(alrededor) & sucias)) & sucias
            agente["ruta"].append(siguiente)
            agente["baterias"].append(agente["bateria"])
    return A, S, agentes, suciasIniciales, limpiadas, tiempo, sucias


@app.route("/")
def index():
    return flask.render_template("index.html")


# simula con los parametros de la url y manda el resultado a la pagina
@app.route("/api/data")
def data():
    url = flask.request.args
    respuesta = (flask.jsonify({"error": "Parametros no validos"}), 400)
    try:
        M, N, nAgentes = int(url.get("m", 16)), int(url.get("n", 16)), int(url.get("robots", 4))
        pctSucio, pctObstaculos = float(url.get("sucio", 0.3)), float(url.get("obstaculos", 0.1))
        tipo, tMax = url.get("tipo", "ZZ"), int(url.get("tmax", 2000))
        # revisa que los parametros tengan sentido
        if (tipo in TIPOS and M >= 2 and N >= 2 and 1 <= nAgentes <= M * N
                and 0 <= pctSucio <= 1 and 0 <= pctObstaculos < 1 and tMax >= 0):
            A, S, agentes, suciasIniciales, limpiadas, tiempo, quedan = simular(
                M, N, nAgentes, pctSucio, pctObstaculos, tMax, tipo,
                int(url["semilla"]) if "semilla" in url else None)
            estaciones = {agente["ruta"][0] for agente in agentes}
            nodes = {}
            for k in range(A.size):
                i, j = numpy.unravel_index(k, A.shape)
                nodes[k + 1] = {"node": k + 1, "point": (int(j), int(M - i), 0),
                                "dirt": int(k in suciasIniciales), "limpia": limpiadas.get(k),
                                "estacion": k in estaciones, "obstaculo": bool(A.flat[k] == 0)}
            respuesta = flask.jsonify({
                "nodes": nodes, "tiempo": tiempo,
                "routes": {a["num"]: [k + 1 for k in a["ruta"]] for a in agentes},
                "baterias": {a["num"]: a["baterias"] for a in agentes}})
    except ValueError:
        respuesta = (flask.jsonify({"error": "Parametros no validos"}), 400)
    return respuesta


# corre todos los escenarios y guarda los datos en resultados.csv
def experimentos():
    with open("resultados.csv", "w", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(["Agentes", "Tipo", "Semilla", "Tiempo", "PctLimpio", "Agente",
                           "Movimientos", "Limpiezas", "UltimaLimpieza", "BateriaFinal",
                           "RutaValida"])
        for nAgentes in [1, 2, 3, 4, 5, 8]:
            for tipo in TIPOS:
                for semilla in range(20):
                    A, S, agentes, suciasIniciales, limpiadas, tiempo, quedan = simular(
                        10, 10, nAgentes, 0.3, 0.1, 1000, tipo, semilla)
                    libres = int(numpy.sum(A))
                    for a in agentes:
                        escritor.writerow([nAgentes, tipo, semilla, tiempo,
                                           round(100 * (libres - len(quedan)) / libres, 1),
                                           a["num"], a["movimientos"], a["limpiezas"],
                                           a["ultimaLimpieza"], a["bateria"],
                                           rutaValida(S, a["ruta"])])
                print(nAgentes, tipo, "listo")


if __name__ == "__main__":
    if "--experimentos" in sys.argv:
        experimentos()
    else:
        app.run(debug=True)
