# TaskFlow — Instrucciones persistentes para Claude Code

## Propósito
TaskFlow ("Seguimiento de Tareas") es una aplicación web full stack de gestión de tareas para
un portafolio de Desarrollador Full Stack Junior. Debe ser funcional, mantenible, accesible y
fácil de explicar en una entrevista técnica. El proyecto también demuestra pericia en
programación con asistentes de IA. El usuario está aprendiendo desarrollo de software:
favorecer implementaciones legibles y documentar las decisiones importantes sin sobreingeniería.

## Tecnologías y alcance
-Frontend: HTML5 semántico, CSS3 responsive y JavaScript vanilla; Fetch API para comunicarse
  con el backend.
-Backend: Node.js (LTS), Express y API REST.
-Persistencia: PostgreSQL y biblioteca pg, con SQL parametrizado.
-Pruebas: ejecutor nativo de Node (node:test) y supertest para los endpoints.
-Herramientas: npm, Git, GitHub y VS Code.
-Aplicación local de un solo usuario en la primera versión; no implementar autenticación ni
  servicios externos.
-No añadir React, TypeScript, ORM, frontend frameworks ni servicios de pago sin autorización.

## Entorno de desarrollo
-Sistema: Windows 11 con WSL2 (Ubuntu). El proyecto vive y se ejecuta en Linux, en
  ~/proyectos/seguimiento_tareas, abierto en VS Code con la ventana conectada a WSL.
-Todo el software se instala en Ubuntu (WSL), nunca en Windows.
-Está autorizado instalar el software de desarrollo necesario en WSL:
  -Node.js LTS mediante nvm (en el directorio del usuario, sin sudo).
  -PostgreSQL mediante apt.
  -Dependencias del proyecto mediante npm (locales al proyecto).
-Claude no puede escribir la contraseña de sudo. Si un comando requiere sudo, mostrar el
  comando exacto, explicar qué hace y pedir al usuario que lo ejecute (con el prefijo ! dentro
  de Claude Code o en otra terminal). Luego verificar el resultado y continuar.
-PostgreSQL de desarrollo: crear un rol y una base de datos locales para el proyecto, con
  credenciales solo de desarrollo guardadas en .env (nunca en el código ni en el repositorio).
  Si el servicio no está activo, iniciarlo (sudo service postgresql start) siguiendo la regla
  de sudo anterior.

## Funcionalidades del MVP
-Crear, consultar, listar, editar y eliminar tareas con confirmación al eliminar.
-Campos: título obligatorio, descripción opcional, estado (pending, in_progress, completed),
  prioridad (low, medium, high), fecha límite opcional y marcas de creación/actualización.
-Filtrar por estado y prioridad, buscar por texto y ordenar por fecha o prioridad.
-Dashboard con recuentos por estado y listado de tareas.
-Persistencia real en PostgreSQL; no fingir persistencia con arreglos en memoria.

## API mínima
-GET /api/tasks
-GET /api/tasks/:id
-POST /api/tasks
-PUT /api/tasks/:id
-PATCH /api/tasks/:id/status
-DELETE /api/tasks/:id

Usar códigos HTTP apropiados, validación de entrada, respuestas JSON coherentes y manejo
centralizado de errores. La entrada del usuario nunca debe concatenarse en sentencias SQL.
No revelar trazas ni secretos en respuestas de producción.

## Convenciones de implementación
-Inspeccionar el repositorio antes de modificar archivos; respetar su estructura y
  convenciones existentes.
-Separar rutas, controladores, lógica de negocio, validaciones y acceso a datos cuando
  aporte claridad.
-Mantener funciones pequeñas, nombres descriptivos y módulos cohesionados; evitar
  abstracciones prematuras.
-Utilizar HTML semántico, etiquetas accesibles, navegación por teclado, estados de carga y
  mensajes claros de éxito/error.
-Evitar XSS: mostrar datos de usuario mediante textContent u otras APIs seguras, no
  innerHTML sin sanitización.
-Validar fechas, prioridades, estados e identificadores del lado del servidor.
-Utilizar variables de entorno; mantener .env.example sin credenciales y excluir .env,
  node_modules, logs y archivos temporales del control de versiones.
-Los scripts SQL deben ser reproducibles y preferentemente no destructivos. Incluir datos de
  demostración sin información personal.

## Forma de trabajo autónoma
Para cada tarea:
1.Inspeccionar los archivos y las herramientas disponibles.
2.Formular un plan breve y ejecutarlo sin pedir confirmación por detalles rutinarios.
3.Implementar primero una versión mínima completamente funcional; no ampliar el alcance por
   iniciativa propia.
4.Ejecutar los comandos de compilación o comprobación, pruebas unitarias/de integración y
   verificaciones disponibles.
5.Corregir los errores detectados y repetir las comprobaciones pertinentes.
6.Hacer un commit pequeño y descriptivo al completar cada etapa verificada.
7.Actualizar documentación relevante y resumir lo completado, lo probado y lo pendiente.

Si falta PostgreSQL, Node.js u otra herramienta, instalarla en WSL según la sección
"Entorno de desarrollo". Si algo no puede resolverse (por ejemplo, un permiso), continuar con
lo que pueda verificarse y documentar exactamente el bloqueo. No confundir pruebas simuladas
con pruebas de integración reales. No afirmar que algo funciona sin haberlo comprobado.

## Seguridad del entorno y Git
-Trabajar exclusivamente dentro del repositorio del proyecto
  (~/proyectos/seguimiento_tareas), salvo la instalación autorizada de herramientas en WSL.
-No modificar ni eliminar archivos ajenos al proyecto; no usar comandos destructivos ni
  sobrescribir contenido preexistente sin verificarlo.
-No saltarse mecanismos de autorización. Solicitar permiso para operaciones destructivas,
  acceder a servicios externos (salvo descargar paquetes con apt, nvm o npm) o incurrir en
  gastos.
-No imprimir, publicar ni versionar credenciales.
-Hacer commits pequeños, coherentes y con mensajes descriptivos. No ejecutar git push, crear
  repositorios remotos, reescribir historial o hacer force-push: eso lo hace el usuario.

## Calidad y pruebas
-Incorporar pruebas automatizadas para validaciones, errores y operaciones CRUD; probar
  endpoints y persistencia real contra la base de datos local.
-Comprobar errores comunes: campos vacíos, IDs inexistentes, entrada malformada, fechas
  inválidas y caídas de base de datos.
-No añadir dependencias solo para resolver problemas triviales.
-Registrar resultados reales de comandos y pruebas; indicar claramente limitaciones del
  entorno.

## Documentación obligatoria
Mantener dos documentos, redactados en español:

### README.md
Explicar qué hace TaskFlow, stack tecnológico real, arquitectura, requisitos previos,
instalación en Windows 11 con WSL2 (Ubuntu) y VS Code, instalación de Node.js y PostgreSQL en
WSL, variables de entorno, configuración de PostgreSQL, scripts npm, uso de la aplicación,
API, pruebas y limitaciones conocidas. Agregar capturas solo si se capturaron de la
aplicación real.

### GUIA_TECNICA.md
Explicar el flujo navegador → API → PostgreSQL, responsabilidades de cada tecnología,
organización del código, principales consultas SQL, CRUD, validaciones, errores frecuentes y
decisiones de diseño. Incluir 15 preguntas de entrevista con respuestas verificables en el
código. Debe servir para que el propietario pueda comprender y defender el proyecto sin
atribuirse conocimientos que todavía no domina. Incluir una sección breve sobre cómo se
desarrolló con un asistente de IA (flujo de trabajo, verificación y decisiones humanas).

## Comunicación
-Responder e informar avances en español; usar nombres técnicos, APIs y código en su idioma
  habitual.
-Al finalizar, incluir: funcionalidades implementadas, archivos relevantes, pruebas
  ejecutadas y su resultado, bloqueos, instrucciones exactas de ejecución y una descripción
  veraz de 2–3 líneas para el CV.
-Priorizar evidencia técnica real sobre afirmaciones promocionales. Nunca inventar
  funcionalidades, pruebas ni resultados.

## Criterio de terminado
No declarar el proyecto completo hasta verificar que el servidor inicia, el frontend se
comunica con la API, las operaciones CRUD y los filtros funcionan, y los datos persisten en
PostgreSQL. Si el entorno impide alguna comprobación, entregar el resto y marcar
explícitamente qué queda sin verificar.