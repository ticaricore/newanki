package api

import (
	"testing"

	"github.com/google/uuid"
)

func TestCategories(t *testing.T) {
	e := newEnv(t)
	c := signedInUser(t, e)

	// New users start with the default categories.
	var list CategoryListResponse
	c.must(200, "GET", "/categories", nil, &list)
	if len(list.Categories) != 3 || list.Categories[0].Name != "Türkçe" || list.Categories[1].Name != "İngilizce" || list.Categories[2].Name != "Arapça" {
		t.Fatalf("defaults = %+v", list.Categories)
	}
	eng := list.Categories[1]

	// Create: name is trimmed, color defaults from the palette, duplicates (any case) are refused.
	var fiz CategoryDTO
	c.must(201, "POST", "/categories", CategoryInput{Name: "  Fizik  "}, &fiz)
	if fiz.Name != "Fizik" || !hexColor.MatchString(fiz.Color) {
		t.Fatalf("created = %+v", fiz)
	}
	c.must(409, "POST", "/categories", CategoryInput{Name: "fizik"}, nil)
	c.must(409, "POST", "/categories", CategoryInput{Name: "ingilizce"}, nil) // Turkish İ folds to i
	c.must(400, "POST", "/categories", CategoryInput{Name: " "}, nil)
	bad := "red"
	c.must(400, "POST", "/categories", CategoryInput{Name: "Kimya", Color: &bad}, nil)

	// Decks refer to categories by uid; unknown ones are refused.
	var deck DeckDTO
	c.must(201, "POST", "/decks", DeckInput{Name: "Vocabulary", Category: eng.UID, Color: "#60A5FA"}, &deck)
	if deck.Category != eng.UID {
		t.Fatalf("deck category = %q", deck.Category)
	}
	c.must(400, "POST", "/decks", DeckInput{Name: "X", Category: uuid.NewString(), Color: "#60A5FA"}, nil)
	c.must(400, "POST", "/decks", DeckInput{Name: "X", Category: "ingilizce", Color: "#60A5FA"}, nil)

	// Rename and recolor; the deck keeps pointing at it.
	name, color := "English", "#123abc"
	var renamed CategoryDTO
	c.must(200, "PATCH", "/categories/"+eng.UID, CategoryPatch{Name: &name, Color: &color}, &renamed)
	if renamed.Name != "English" || renamed.Color != "#123ABC" || renamed.DeckCount != 1 {
		t.Fatalf("renamed = %+v", renamed)
	}
	same := "english"
	c.must(200, "PATCH", "/categories/"+eng.UID, CategoryPatch{Name: &same}, nil) // own name in another case is fine
	taken := "Fizik"
	c.must(409, "PATCH", "/categories/"+eng.UID, CategoryPatch{Name: &taken}, nil)

	// Delete: decks stay, without a category.
	c.must(204, "DELETE", "/categories/"+eng.UID, nil, nil)
	c.must(404, "DELETE", "/categories/"+eng.UID, nil, nil)
	var got DeckDTO
	c.must(200, "GET", "/decks/"+deck.UID, nil, &got)
	if got.Category != "" {
		t.Fatalf("deck category after delete = %q", got.Category)
	}
	c.must(200, "GET", "/categories", nil, &list)
	if len(list.Categories) != 3 {
		t.Fatalf("after delete = %+v", list.Categories)
	}
}
