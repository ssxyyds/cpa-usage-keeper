package codexpool

type ManualScoreRequest struct {
	AuthIndex  string  `json:"auth_index"`
	Adjustment float64 `json:"adjustment"`
}
