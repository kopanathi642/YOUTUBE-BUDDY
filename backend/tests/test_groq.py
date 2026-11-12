"""Groq provider regressions. Also runnable with unittest without database fixtures."""
import os
import unittest
from unittest.mock import patch

import httpx

from app.tools import providers, registry


class GroqTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_json_request_and_priority(self):
        os.environ.update(LLM_BASE_URL="http://local", OPENAI_API_KEY="unused", ANTHROPIC_API_KEY="unused")
        response = httpx.Response(200, json={"choices": [{"message": {"content": '{"items": []}'}}]})
        with patch.object(providers.httpx, "post", return_value=response) as post:
            result, model = providers.llm_json("Write hooks", "Travel vlog")
        self.assertEqual(result, {"items": []})
        self.assertEqual(model, "openai/gpt-oss-20b")
        post.assert_called_once()
        self.assertEqual(post.call_args.args[0], "https://api.groq.com/openai/v1/chat/completions")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(post.call_args.kwargs["json"]["response_format"], {"type": "json_object"})

    def test_errors_never_fall_back_or_expose_response(self):
        os.environ["OPENAI_API_KEY"] = "unused"
        for code in (401, 403, 429, 500):
            with self.subTest(code=code):
                with patch.object(providers.httpx, "post", return_value=httpx.Response(code, text="private detail")) as post:
                    with self.assertRaises(providers.ProviderError) as error:
                        providers.llm_json("JSON", "test")
                self.assertNotIn("private detail", str(error.exception))
                post.assert_called_once()

    def test_timeout_and_malformed_response(self):
        with patch.object(providers.httpx, "post", side_effect=httpx.ReadTimeout("private detail")):
            with self.assertRaisesRegex(providers.ProviderError, "temporarily unreachable"):
                providers.llm_json("JSON", "test")
        for body in ({"choices": []}, {"choices": [{"message": {"content": None}}]}):
            with patch.object(providers.httpx, "post", return_value=httpx.Response(200, json=body)):
                with self.assertRaisesRegex(providers.ProviderError, "unreadable response"):
                    providers.llm_json("JSON", "test")

    def test_catalogue_and_local_restrictions(self):
        os.environ["LLM_BASE_URL"] = "http://local"
        self.assertTrue(providers.llm_ready())
        self.assertTrue(registry.keys()["llm"])
        self.assertFalse(registry.local_llm_only())
        self.assertEqual(registry.status(registry.TOOLS["051"])["state"], "ready")
        del os.environ["GROQ_API_KEY"]
        self.assertTrue(registry.local_llm_only())
        self.assertEqual(registry.status(registry.TOOLS["051"])["state"], "needs_key")
        del os.environ["LLM_BASE_URL"]
        self.assertFalse(providers.llm_ready())


if __name__ == "__main__":
    unittest.main()
