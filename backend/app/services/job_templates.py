import random
from app.models.agent import AgentSpecialty, SPECIALTY_PRICE_RANGES


# Job templates with variables for hybrid generation
JOB_TEMPLATES = {
    AgentSpecialty.DESIGNER: [
        {
            "title": "Design {item} for {client_type}",
            "description": "Create a professional {item} that reflects the brand identity and values of a {client_type}. The design should be modern, clean, and visually appealing.",
            "variables": {
                "item": ["logo", "website mockup", "app icon", "landing page", "brand identity kit", "social media graphics", "business card", "banner ad"],
                "client_type": ["tech startup", "enterprise company", "nonprofit organization", "e-commerce store", "healthcare provider", "educational institution", "creative agency", "financial services firm"],
            },
        },
        {
            "title": "Create {design_type} design",
            "description": "Design a {design_type} that is eye-catching and professional. Must be delivered in multiple formats and sizes.",
            "variables": {
                "design_type": ["mobile app UI", "dashboard interface", "email template", "infographic", "presentation deck", "product packaging", "event poster", "magazine layout"],
            },
        },
    ],
    AgentSpecialty.CODER: [
        {
            "title": "Build {feature} for {platform}",
            "description": "Develop a fully functional {feature} for a {platform} application. Code should be clean, well-documented, and follow best practices.",
            "variables": {
                "feature": ["authentication system", "payment integration", "REST API", "real-time chat", "file upload system", "search functionality", "notification system", "analytics dashboard"],
                "platform": ["web", "mobile", "desktop", "cross-platform", "iOS", "Android", "React", "Node.js"],
            },
        },
        {
            "title": "Fix {issue_type} in {codebase}",
            "description": "Debug and resolve {issue_type} issues in the {codebase}. Provide detailed documentation of changes made.",
            "variables": {
                "issue_type": ["performance", "security vulnerability", "memory leak", "database query", "API response", "authentication", "caching", "concurrency"],
                "codebase": ["Python backend", "JavaScript frontend", "React application", "Node.js server", "microservices architecture", "legacy system", "TypeScript project", "GraphQL API"],
            },
        },
    ],
    AgentSpecialty.WRITER: [
        {
            "title": "Write {content_type} about {topic}",
            "description": "Create engaging {content_type} content about {topic}. The writing should be well-researched, SEO-optimized, and tailored to the target audience.",
            "variables": {
                "content_type": ["blog post", "technical documentation", "marketing copy", "product description", "email sequence", "social media content", "whitepaper", "case study"],
                "topic": ["AI and machine learning", "remote work productivity", "digital marketing trends", "sustainable technology", "startup growth strategies", "cybersecurity best practices", "cloud computing", "data analytics"],
            },
        },
        {
            "title": "Create {document_type} for {purpose}",
            "description": "Write a professional {document_type} for {purpose}. Must be clear, concise, and professionally formatted.",
            "variables": {
                "document_type": ["user manual", "API documentation", "training guide", "proposal", "press release", "newsletter", "annual report", "FAQ section"],
                "purpose": ["product launch", "investor pitch", "customer onboarding", "internal training", "public relations", "stakeholder update", "compliance documentation", "knowledge base"],
            },
        },
    ],
    AgentSpecialty.DATA_ANALYST: [
        {
            "title": "Analyze {data_type} for {goal}",
            "description": "Perform comprehensive analysis of {data_type} to achieve {goal}. Provide actionable insights and visualizations.",
            "variables": {
                "data_type": ["customer behavior data", "sales performance metrics", "website analytics", "social media engagement", "market research data", "financial transactions", "user feedback", "operational metrics"],
                "goal": ["growth optimization", "cost reduction", "customer retention improvement", "market opportunity identification", "risk assessment", "performance benchmarking", "trend forecasting", "segmentation analysis"],
            },
        },
        {
            "title": "Build {report_type} dashboard",
            "description": "Create an interactive {report_type} dashboard with real-time data visualization and key performance indicators.",
            "variables": {
                "report_type": ["executive summary", "sales performance", "marketing ROI", "customer analytics", "financial health", "operational efficiency", "product metrics", "team productivity"],
            },
        },
    ],
    AgentSpecialty.TESTER: [
        {
            "title": "Test {test_scope} for {application}",
            "description": "Perform comprehensive {test_scope} testing for {application}. Document all findings and provide detailed bug reports.",
            "variables": {
                "test_scope": ["end-to-end", "integration", "performance", "security", "usability", "regression", "load", "accessibility"],
                "application": ["web application", "mobile app", "API endpoints", "e-commerce platform", "SaaS product", "payment system", "authentication flow", "data pipeline"],
            },
        },
        {
            "title": "QA {feature} implementation",
            "description": "Quality assurance testing for {feature}. Create test cases, execute tests, and verify functionality meets requirements.",
            "variables": {
                "feature": ["user registration", "checkout process", "search functionality", "file upload", "notification system", "admin dashboard", "reporting module", "third-party integration"],
            },
        },
    ],
}


def generate_job(specialty: AgentSpecialty | None = None) -> dict:
    """Generate a random job from templates."""
    if specialty is None:
        specialty = random.choice(list(AgentSpecialty))

    templates = JOB_TEMPLATES[specialty]
    template = random.choice(templates)

    # Fill in variables
    title = template["title"]
    description = template["description"]

    for var_name, var_options in template["variables"].items():
        chosen = random.choice(var_options)
        title = title.replace("{" + var_name + "}", chosen)
        description = description.replace("{" + var_name + "}", chosen)

    # Generate base price within specialty range
    price_min, price_max = SPECIALTY_PRICE_RANGES[specialty]
    base_price = random.randint(price_min, price_max)

    return {
        "title": title,
        "description": description,
        "specialty": specialty,
        "base_price": base_price,
    }
