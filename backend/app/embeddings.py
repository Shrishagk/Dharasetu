"""Semantic embeddings for geospatial attribute matching.

Integrates with:
- sentence-transformers (default, CPU-friendly)
- Azure OpenAI embedding API (optional)
- Future: Prithvi-EO-2.0 / Clay foundation models for raster data
"""

import json
import os
from typing import Optional

import numpy as np

# Try to import sentence-transformers; fall back gracefully
try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False

# Try to import Azure OpenAI; fall back gracefully
try:
    from azure.ai.openai import AzureOpenAIClient
    HAS_AZURE_OPENAI = True
except ImportError:
    HAS_AZURE_OPENAI = False


class EmbeddingBackend:
    """Abstract base for embedding backends."""
    
    def embed_text(self, text: str) -> list[float]:
        """Embed a single text string."""
        raise NotImplementedError
    
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts."""
        raise NotImplementedError
    
    def get_backend_name(self) -> str:
        """Return backend identifier for metadata."""
        raise NotImplementedError


class SentenceTransformerBackend(EmbeddingBackend):
    """Uses HuggingFace sentence-transformers (CPU-friendly, no GPU needed)."""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """Initialize with a specific model."""
        if not HAS_SENTENCE_TRANSFORMERS:
            raise ImportError(
                "sentence-transformers not installed. "
                "Install: pip install sentence-transformers"
            )
        self.model = SentenceTransformer(model_name)
        self.model_name = model_name
    
    def embed_text(self, text: str) -> list[float]:
        """Embed a single text."""
        embeddings = self.model.encode([text], convert_to_tensor=False)
        return embeddings[0].tolist()
    
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts."""
        embeddings = self.model.encode(texts, convert_to_tensor=False)
        return [e.tolist() for e in embeddings]
    
    def get_backend_name(self) -> str:
        return f"sentence-transformers:{self.model_name}"


class AzureOpenAIBackend(EmbeddingBackend):
    """Uses Azure OpenAI embedding API for cloud-native deployment."""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        api_version: str = "2024-02-15-preview",
        endpoint: Optional[str] = None,
        deployment: str = "text-embedding-3-small",
    ):
        """Initialize Azure OpenAI client."""
        if not HAS_AZURE_OPENAI:
            raise ImportError(
                "azure-ai-openai not installed. "
                "Install: pip install azure-ai-openai"
            )
        
        self.api_key = api_key or os.getenv("AZURE_OPENAI_API_KEY")
        self.endpoint = endpoint or os.getenv("AZURE_OPENAI_ENDPOINT")
        self.deployment = deployment
        
        if not self.api_key or not self.endpoint:
            raise ValueError(
                "Azure OpenAI credentials not configured. "
                "Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables."
            )
        
        # Note: Actual client initialization would depend on the version installed
        # This is a placeholder for future integration
        self.client = None  # Will be initialized when needed
    
    def embed_text(self, text: str) -> list[float]:
        """Embed a single text via Azure OpenAI."""
        # Placeholder: would call Azure API
        raise NotImplementedError("Azure OpenAI backend requires full integration")
    
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts via Azure OpenAI."""
        # Placeholder: would call Azure API
        raise NotImplementedError("Azure OpenAI backend requires full integration")
    
    def get_backend_name(self) -> str:
        return f"azure-openai:{self.deployment}"


class LocalMorphologyBackend(EmbeddingBackend):
    """Fallback: shape-based descriptors (morphology-only, not semantic)."""
    
    def embed_text(self, text: str) -> list[float]:
        """Fallback to text length + character hash-based embedding."""
        # Very basic fallback for demo purposes
        text_len = len(text)
        char_hash = sum(ord(c) for c in text) % 1000
        return [text_len / 100.0, char_hash / 1000.0]
    
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Fallback batch embedding."""
        return [self.embed_text(t) for t in texts]
    
    def get_backend_name(self) -> str:
        return "morphology-fallback"


# Global embedding instance
_embedding_backend: Optional[EmbeddingBackend] = None


def init_embeddings(backend: str = "sentence-transformers") -> EmbeddingBackend:
    """Initialize the global embedding backend."""
    global _embedding_backend
    
    if backend == "sentence-transformers":
        _embedding_backend = SentenceTransformerBackend()
    elif backend == "azure-openai":
        _embedding_backend = AzureOpenAIBackend()
    elif backend == "morphology":
        _embedding_backend = LocalMorphologyBackend()
    else:
        raise ValueError(f"Unknown embedding backend: {backend}")
    
    print(f"✅ Embedding backend initialized: {_embedding_backend.get_backend_name()}")
    return _embedding_backend


def get_embeddings() -> EmbeddingBackend:
    """Get the current embedding backend instance."""
    global _embedding_backend
    if _embedding_backend is None:
        # Auto-initialize with best available backend
        backend_choice = "sentence-transformers" if HAS_SENTENCE_TRANSFORMERS else "morphology"
        _embedding_backend = init_embeddings(backend_choice)
    return _embedding_backend


def embed_field_value(value: str) -> list[float]:
    """Embed a single field value for attribute matching."""
    if not value or not isinstance(value, str):
        return [0.0] * 384  # Default dimension (MiniLM produces 384-dim vectors)
    backend = get_embeddings()
    return backend.embed_text(value)


def embed_field_values_batch(values: list[str]) -> list[list[float]]:
    """Embed multiple field values."""
    if not values:
        return []
    # Filter out empty values
    values = [v for v in values if v and isinstance(v, str)]
    if not values:
        return []
    backend = get_embeddings()
    return backend.embed_batch(values)


def semantic_similarity(embedding1: list[float], embedding2: list[float]) -> float:
    """Compute cosine similarity between two embeddings (0-1)."""
    e1 = np.array(embedding1)
    e2 = np.array(embedding2)
    
    norm1 = np.linalg.norm(e1)
    norm2 = np.linalg.norm(e2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    similarity = np.dot(e1, e2) / (norm1 * norm2)
    # Clamp to [0, 1]
    return float(max(0.0, min(1.0, (similarity + 1) / 2)))
